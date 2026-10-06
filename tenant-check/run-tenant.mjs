import { readFileSync, writeFileSync } from 'node:fs';
import { CASES } from './cases.mjs';

const dir = 'C:/Users/christophe.chazeau/AppData/Local/Temp/.isc';
const host = readFileSync(`${dir}/tenant`, 'utf8').trim();
const token = readFileSync(`${dir}/token`, 'utf8').trim();
const [tenant, ...domain] = host.split('.');
const api = `https://${tenant}.api.${domain.join('.')}`;
const identityId = '004d62003d304329950ea461e3e58e61';
const attributes = [
  'city', 'costCenter', 'country', 'department', 'displayName', 'email', 'endDate', 'firstname',
  'identificationNumber', 'initials', 'lastname', 'licenseStatus', 'location', 'locationCode', 'middleName',
  'nextProcessing', 'organization', 'personalEmail', 'phone', 'postalCode', 'preferredLanguage', 'preferredName',
  'startDate', 'state', 'streetAddress', 'timezone', 'title', 'uid', 'workPhone', 'googleemail', 'ibmiusername',
  'jobTitle',
];

const call = async (method, path, body) => {
  const response = await fetch(api + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch {}
  return { status: response.status, body: parsed };
};

// middleName is the null source for several cases, so it must keep its real mapping.
const targets = attributes.filter((name) => name !== 'middleName');
const results = {};
for (let start = 0; start < CASES.length; start += targets.length) {
  const batch = CASES.slice(start, start + targets.length);
  const created = [];
  try {
    for (const [index, [label, definition]] of batch.entries()) {
      const name = `optimusprime-case-${start + index}`;
      const response = await call('POST', '/v3/transforms', { name, ...definition });
      if (response.status !== 201) {
        results[label] = { created: false, status: response.status, error: JSON.stringify(response.body).slice(0, 300) };
        continue;
      }
      created.push({ label, name, id: response.body.id, attribute: targets[index] });
    }
    const preview = await call('POST', '/v3/identity-profiles/identity-preview', {
      identityId,
      identityAttributeConfig: {
        enabled: true,
        attributeTransforms: [
          { identityAttributeName: 'middleName', transformDefinition: { type: 'identityAttribute', attributes: { name: 'middleName' } } },
          ...created.map((item) => ({
            identityAttributeName: item.attribute,
            transformDefinition: { type: 'reference', attributes: { id: item.name } },
          })),
        ].filter((item) => item.identityAttributeName !== 'middleName'),
      },
    });
    console.log('preview', preview.status);
    const byName = new Map((preview.body?.previewAttributes ?? []).map((item) => [item.name, item]));
    for (const item of created) {
      const row = byName.get(item.attribute);
      results[item.label] = {
        value: row?.value ?? null,
        errors: row?.errorMessages?.map((message) => message.text) ?? null,
        ...(preview.status === 200 ? {} : { status: preview.status, error: JSON.stringify(preview.body).slice(0, 300) }),
      };
    }
  } finally {
    for (const item of created) {
      await call('DELETE', `/v3/transforms/${item.id}`);
    }
  }
}
writeFileSync(new URL('./tenant-results.json', import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
