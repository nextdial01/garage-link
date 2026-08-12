const NON_DELIVERABLE_QA_DOMAINS=new Set([
  'example.invalid','example.com','example.net','example.org',
  'localhost','mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com',
]);

function fail(code){throw new Error(code)}

function normalizeEmail(value){return String(value??'').trim().toLowerCase()}

// This module deliberately has no SDK imports: the GitHub transport-state job
// runs before dependency installation and must reject invalid recipients before
// it can cause a Supabase Auth email send.
export function validateActualEmailTransportRecipient(value){
  const email=normalizeEmail(value);
  const match=/^([^@+\s]+)(?:\+[^@\s]*)?@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.exec(email);
  if(!match)fail('EMAIL_TRANSPORT_NOT_CONFIGURED:INVALID_RECIPIENT');
  const [,localPart,domain]=match;
  if(NON_DELIVERABLE_QA_DOMAINS.has(domain)||domain.endsWith('.localhost'))fail('EMAIL_TRANSPORT_NOT_CONFIGURED:NON_DELIVERABLE_RECIPIENT');
  return {emailAddress:`${localPart}@${domain}`,recipient:'REDACTED_APPROVED_QA_MAILBOX',plusAddressing:false};
}
