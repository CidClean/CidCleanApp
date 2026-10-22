-- Hito 4: el detalle del quote trae la frecuencia y la dirección del walkthrough cerrado (vista previa del cliente).

create or replace function get_site_quote(p_site uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  prices boolean := has_permission('quotes_ver_precios');
  sow boolean := has_permission('sow_contratos_subir_ver');
  w walkthroughs;
  wv walkthrough_versions;
  res jsonb;
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    raise exception 'No tienes permiso para ver quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into w from walkthroughs where site_id = p_site;
  select * into wv from walkthrough_versions where walkthrough_id = w.id and version = w.current_version;
  select * into q from quotes where site_id = p_site;
  if q.id is null then
    return jsonb_build_object('quote_id', null, 'walkthrough_closed', coalesce(w.current_version, 0) > 0, 'versions', '[]'::jsonb,
                              'frequency', wv.data->'frequency', 'address', nullif(btrim(wv.data->'contact'->>'address'), ''));
  end if;
  -- Quien ve el quote decidido lo da por visto en el Inicio (D-209: pendiente en el Inicio).
  update quote_versions set decision_seen_at = now()
   where quote_id = q.id and decided_at is not null and decision_seen_at is null;
  select jsonb_build_object(
    'quote_id', q.id, 'walkthrough_closed', coalesce(w.current_version, 0) > 0,
    'frequency', wv.data->'frequency', 'address', nullif(btrim(wv.data->'contact'->>'address'), ''),
    'versions', coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'version', quote_version_label(v.minor), 'minor', v.minor, 'status', v.status,
      'lines', case when prices then v.lines else (
          select jsonb_build_object(
            'services', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'services') x), '[]'),
            'addons', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'addons') x), '[]'),
            'discounts', coalesce((select jsonb_agg(x - 'value') from jsonb_array_elements(v.lines->'discounts') x), '[]'))) end,
      'tax_rate', v.tax_rate, 'valid_days', v.valid_days,
      'subtotal', case when prices then v.subtotal end, 'discount', case when prices then v.discount end,
      'tax', case when prices then v.tax end, 'total', case when prices then v.total end,
      'contact_email', v.contact_email, 'recipients', to_jsonb(v.recipients),
      'has_sow', v.sow_path is not null, 'sow_path', case when sow then v.sow_path end,
      'pdf_path', case when prices then v.pdf_path end,
      'sent_at', v.sent_at, 'expires_at', v.expires_at, 'viewed_at', v.viewed_at, 'decided_at', v.decided_at,
      'sent_by', (select full_name from profiles where id = v.sent_by),
      'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'title', d.signer_title,
                     'reason_es', r.label_es, 'reason_en', r.label_en, 'note', d.note, 'at', d.created_at, 'email', d.email)
                     from quote_decisions d left join lost_reasons r on r.id = d.reason_id where d.version_id = v.id)
    ) order by v.minor desc), '[]'::jsonb))
    into res
    from quote_versions v where v.quote_id = q.id;
  return res;
end $$;

