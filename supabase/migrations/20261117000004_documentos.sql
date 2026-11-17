-- Orden 115 (D-317 4, D-320 4): Menú → Documentos. Una biblioteca con lo que la app genera o guarda, y cada persona ve
-- SOLO lo que ya puede ver hoy con sus permisos (las mismas reglas de las funciones que abren cada documento):
--  · Quotes (PDF con precios): quotes_ver y quotes_ver_precios (la regla del bucket quote-files para el PDF).
--  · SOW enviados: sow_contratos_subir_ver (la regla del bucket para sow-*.pdf).
--  · Contratos (documentos del jobsite): clientes_ver y clientes_ver_tarifa (open_jobsite_document); los demás
--    documentos del jobsite con clientes_ver (solo en "Todos").
--  · Walkthroughs cerrados: can_see_walkthroughs().
--  · Personal: W-9 y certificado de seguro con empleados_gestionar_documentos, el W-9 ajeno solo el Super Admin, y los
--    propios siempre (open_profile_document); el ICA firmado solo el Super Admin (ica-signed).
--  · Reportes: los estados de cuenta mensuales guardados, con empleados_ver_pagos. Hoy la app no guarda estados de
--    cuenta (se arman al vuelo, como el P&L y el horario), así que la lista sale vacía hasta que exista ese archivo.
--  · Las fotos no entran.
-- Abrir y descargar siguen usando las funciones de cada documento (enlaces temporales, historial).

create function documents_library(p_filter text default 'all', p_search text default null, p_offset integer default 0)
returns table (doc_kind text, doc_id text, title text, owner text, doc_date timestamptz, open_source text, open_id text,
               open_path text, open_version integer, super_admin_only boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  f text := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'all');
  s text := nullif(btrim(coalesce(p_search, '')), '');
  pat text;
  me uuid := current_profile_id();
  v_quotes boolean := has_permission('quotes_ver') and has_permission('quotes_ver_precios');
  v_sow boolean := has_permission('sow_contratos_subir_ver');
  v_clients boolean := has_permission('clientes_ver');
  v_contracts boolean := has_permission('clientes_ver') and has_permission('clientes_ver_tarifa');
  v_walk boolean := can_see_walkthroughs();
  v_docs boolean := has_permission('empleados_gestionar_documentos');
  v_super boolean := is_super_admin();
begin
  if f not in ('all', 'quotes', 'sow', 'contracts', 'walkthroughs', 'personal', 'reports') then
    raise exception 'Filtro no válido' using errcode = '22023';
  end if;
  if s is not null and length(s) > 100 then raise exception 'Búsqueda muy larga' using errcode = '22023'; end if;
  pat := case when s is null then null else '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  return query
  with docs as (
    -- Quotes enviados (PDF con precios).
    select 'quote'::text k, v.id::text i, 'Quote ' || quote_number_label(q.number) || ' v' || quote_version_label(v.minor) t,
           coalesce(nullif(v.snapshot->>'company', ''), cl.name, lead_display_name(l.company, l.contact_name), '') o,
           coalesce(v.sent_at, v.created_at) d, 'quote-file'::text src, null::text oid, v.pdf_path p, null::int ver, false sa
      from quote_versions v join quotes q on q.id = v.quote_id
      left join leads l on l.id = q.lead_id left join jobsites j on j.id = q.jobsite_id left join clients cl on cl.id = j.client_id
     where v.pdf_path is not null and v_quotes and f in ('all', 'quotes')
    union all
    -- SOW enviados (generado en la app o subido antes).
    select 'sow', v.id::text,
           case when v.sow_fields is not null then sow_label(q.number) || ' v' || quote_version_label(v.minor)
                else 'SOW · ' || quote_number_label(q.number) || ' v' || quote_version_label(v.minor) end,
           coalesce(nullif(v.snapshot->>'company', ''), lead_display_name(l.company, l.contact_name), ''),
           coalesce(v.sent_at, v.created_at), 'quote-file', null, v.sow_path, null, false
      from quote_versions v join quotes q on q.id = v.quote_id left join leads l on l.id = q.lead_id
     where v.sow_path is not null and v.status <> 'draft' and v_sow and f in ('all', 'sow')
    union all
    -- Documentos vigentes del jobsite: el contrato con la tarifa; los demás solo en "Todos".
    select case when jd.kind = 'contract' then 'contract' else 'jobsite' end, jd.id::text,
           coalesce(nullif(btrim(jd.title), ''), jd.kind) || ' v' || jd.version,
           cl.name || ' · ' || j.name, jd.uploaded_at, 'jobsite', jd.id::text, null, null, false
      from jobsite_documents jd join jobsites j on j.id = jd.jobsite_id join clients cl on cl.id = j.client_id
     where jd.replaced_at is null
       and ((jd.kind = 'contract' and v_contracts and f in ('all', 'contracts'))
            or (jd.kind <> 'contract' and v_clients and f = 'all'))
    union all
    -- Walkthroughs cerrados (cada versión).
    select 'walkthrough', wv.walkthrough_id::text || ':' || wv.version, 'Walkthrough v' || wv.version,
           lead_display_name(l.company, l.contact_name) || ' · ' || lead_site_label(ls.name, ls.address),
           wv.created_at, 'walkthrough', wv.walkthrough_id::text, null, wv.version, false
      from walkthrough_versions wv join walkthroughs w on w.id = wv.walkthrough_id
      join lead_sites ls on ls.id = w.site_id join leads l on l.id = ls.lead_id
     where v_walk and f in ('all', 'walkthroughs')
    union all
    -- Personal: W-9 y certificado de seguro vigentes.
    select 'personal', pd.id::text, case pd.kind when 'w9' then 'W-9' else 'Insurance certificate' end,
           coalesce(p.full_name, ''), pd.uploaded_at, 'document', pd.id::text, null, null, pd.kind = 'w9'
      from profile_documents pd join profiles p on p.id = pd.profile_id
     where pd.replaced_at is null and f in ('all', 'personal')
       and (pd.profile_id = me or (v_docs and (pd.kind <> 'w9' or v_super)))
    union all
    -- ICA firmado: solo el Super Admin.
    select 'personal', ca.id::text, 'ICA-' || lpad(ca.number::text, 4, '0'), coalesce(p.full_name, ''),
           coalesce(ca.cc_signed_at, ca.created_at), 'ica-signed', ca.id::text, null, null, true
      from contractor_agreements ca join profiles p on p.id = ca.profile_id
     where ca.status = 'signed' and ca.signed_path is not null and v_super and f in ('all', 'personal')
  )
  select x.k, x.i, x.t, x.o, x.d, x.src, x.oid, x.p, x.ver, x.sa
    from docs x
   where pat is null or x.t ilike pat or x.o ilike pat
   order by x.d desc nulls last, x.i
   limit 50 offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke execute on function documents_library(text, text, integer) from public, anon;
grant execute on function documents_library(text, text, integer) to authenticated;
