-- Orden 150 (D-339, D-340): detalle del jobsite con pestañas Summary / Documents / History.
--  · jobsite_library: los documentos de UN jobsite y de su cliente (quotes del sitio y de extras, SOW, contrato y demás
--    documentos del jobsite, walkthroughs del sitio), con las mismas reglas de permisos de documents_library
--    (migración 20261117000004). Abrir y descargar siguen usando el visor y las funciones de cada documento.
--  · jobsite_history: los cambios del jobsite (change_log, con historial_ver, sin las aperturas de cifras ni montos) y
--    los correos enviados al cliente (correos con plantilla y recordatorios del quote, con clientes_ver).
-- No toca Schedule and Work (D-340).

create function jobsite_library(p_jobsite uuid)
returns table (doc_kind text, doc_id text, title text, owner text, doc_date timestamptz, open_source text, open_id text,
               open_path text, open_version integer, super_admin_only boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites;
  v_quotes boolean := has_permission('quotes_ver') and has_permission('quotes_ver_precios');
  v_sow boolean := has_permission('sow_contratos_subir_ver');
  v_clients boolean := has_permission('clientes_ver');
  v_contracts boolean := has_permission('clientes_ver') and has_permission('clientes_ver_tarifa');
  v_walk boolean := can_see_walkthroughs();
begin
  if not v_clients then
    raise exception 'No tienes permiso para ver clientes' using errcode = '42501';
  end if;
  select * into j from jobsites where id = p_jobsite;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  return query
  with qs as (
    select q.* from quotes q
     where (j.site_id is not null and q.site_id = j.site_id) or q.jobsite_id = j.id
  ),
  docs as (
    select 'quote'::text k, v.id::text i, 'Quote ' || quote_number_label(q.number) || ' v' || quote_version_label(v.minor) t,
           coalesce(nullif(v.snapshot->>'company', ''), cl.name, '') o,
           coalesce(v.sent_at, v.created_at) d, 'quote-file'::text src, null::text oid, v.pdf_path p, null::int ver, false sa
      from quote_versions v join qs q on q.id = v.quote_id join clients cl on cl.id = j.client_id
     where v.pdf_path is not null and v_quotes
    union all
    select 'sow', v.id::text,
           case when v.sow_fields is not null then sow_label(q.number) || ' v' || quote_version_label(v.minor)
                else 'SOW · ' || quote_number_label(q.number) || ' v' || quote_version_label(v.minor) end,
           coalesce(nullif(v.snapshot->>'company', ''), cl.name, ''),
           coalesce(v.sent_at, v.created_at), 'quote-file', null, v.sow_path, null, false
      from quote_versions v join qs q on q.id = v.quote_id join clients cl on cl.id = j.client_id
     where v.sow_path is not null and v.status <> 'draft' and v_sow
    union all
    select case when jd.kind = 'contract' then 'contract' else 'jobsite' end, jd.id::text,
           coalesce(nullif(btrim(jd.title), ''), jd.kind) || ' v' || jd.version,
           cl.name || ' · ' || j.name, jd.uploaded_at, 'jobsite', jd.id::text, null, null, false
      from jobsite_documents jd join clients cl on cl.id = j.client_id
     where jd.jobsite_id = j.id and jd.replaced_at is null
       and ((jd.kind = 'contract' and v_contracts) or jd.kind <> 'contract')
    union all
    select 'walkthrough', wv.walkthrough_id::text || ':' || wv.version, 'Walkthrough v' || wv.version,
           lead_display_name(l.company, l.contact_name) || ' · ' || lead_site_label(ls.name, ls.address),
           wv.created_at, 'walkthrough', wv.walkthrough_id::text, null, wv.version, false
      from walkthrough_versions wv join walkthroughs w on w.id = wv.walkthrough_id
      join lead_sites ls on ls.id = w.site_id join leads l on l.id = ls.lead_id
     where v_walk and ((j.site_id is not null and w.site_id = j.site_id) or w.id = j.walkthrough_id)
  )
  select x.k, x.i, x.t, x.o, x.d, x.src, x.oid, x.p, x.ver, x.sa
    from docs x
   order by x.d desc nulls last, x.i
   limit 100;
end $$;

-- Acciones del jobsite que no son cambios (abrir cifras o documentos) quedan fuera de su History (D-200).
create function jobsite_history(p_jobsite uuid)
returns table (id bigint, at timestamptz, action text, actor text, info jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites;
  v_log boolean := has_permission('historial_ver');
begin
  if not has_permission('clientes_ver') then
    raise exception 'No tienes permiso para ver clientes' using errcode = '42501';
  end if;
  select * into j from jobsites where jobsites.id = p_jobsite;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  return query
    select l.id, l.at, l.action, a.full_name,
           case when l.action = 'correo_plantilla' or l.action = 'quote_recordatorio'
                then jsonb_strip_nulls(jsonb_build_object('plantilla', l.detail->>'plantilla', 'version', l.detail->'version'))
                when l.action = 'jobsite_estado_cambiado'
                then jsonb_build_object('antes', l.detail->>'antes', 'despues', l.detail->>'despues')
                else jsonb_strip_nulls(jsonb_build_object('kind', l.detail->>'kind', 'version', l.detail->'version',
                                                          'month', l.detail->>'month'))
           end
      from change_log l left join profiles a on a.id = l.actor_id
     where (v_log and l.entity = 'jobsites' and l.entity_id = j.id
            and l.action not in ('tarifa_abierta', 'margen_abierto', 'documento_abierto', 'dashboard_cuenta_abierto',
                                 'costo_personal_abierto'))
        or (l.entity = 'clients' and l.entity_id = j.client_id and l.action in ('correo_plantilla', 'quote_recordatorio'))
     order by l.id desc
     limit 100;
end $$;

revoke execute on function jobsite_library(uuid), jobsite_history(uuid) from public, anon;
grant execute on function jobsite_library(uuid), jobsite_history(uuid) to authenticated;
