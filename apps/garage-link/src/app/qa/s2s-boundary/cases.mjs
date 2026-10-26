export const CASES=Object.freeze({past299:-299,past300:-300,past301:-301,future299:299,future300:300,future301:301});
export function expectedForOffset(offset){if(!Object.values(CASES).includes(offset))throw Error('QA_CASE_DENIED');return Math.abs(offset)<=300;}
