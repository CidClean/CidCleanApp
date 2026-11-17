import { getEmailTemplatesStrings, type EmailTemplatesStrings } from './emailTemplates';
import { useSession } from '@/lib/session';

export function useEmailTemplatesStrings(): EmailTemplatesStrings {
  return getEmailTemplatesStrings(useSession().locale);
}
