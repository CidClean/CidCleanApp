import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../AppText';
import { Segmented } from '../Segmented';
import { useContractStrings } from '@/i18n/contract';
import { fetchCleaningType, saveCleaningType, type CleaningType } from '@/lib/contractApi';
import { sample, useTheme } from '@/theme';

/**
 * "Tipo de limpieza" (D-283, diseño D-289): No residencial (por defecto) o Residencial, con la nota del 6 %. En el lead
 * (leads_editar) y en el jobsite (clientes_editar_datos); sin permiso se muestra sin poder cambiarlo.
 */
export function CleaningTypeField({ kind, id, canEdit }: { kind: 'lead' | 'jobsite'; id: string; canEdit: boolean }) {
  const { colors } = useTheme();
  const k = useContractStrings();
  const [value, setValue] = useState<CleaningType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let off = false;
    void fetchCleaningType(kind, id).then((v) => {
      if (!off) setValue(v);
    });
    return () => {
      off = true;
    };
  }, [kind, id]);

  if (!value) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 6 }}>
        {k.cleaningType}
      </AppText>
      <Segmented<CleaningType>
        options={[
          { value: 'non_residential', label: k.nonResidential },
          { value: 'residential', label: k.residential },
        ]}
        value={value}
        onChange={async (v) => {
          if (!canEdit || v === value) return;
          const before = value;
          setValue(v);
          setFailed(false);
          if (!(await saveCleaningType(kind, id, v))) {
            setValue(before);
            setFailed(true);
          }
        }}
      />
      <AppText size={12} color={failed ? colors.attentionText : colors.secondary} style={{ marginTop: 6 }}>
        {failed ? k.error : k.residentialNote}
      </AppText>
    </View>
  );
}
