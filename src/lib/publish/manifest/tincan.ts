export interface TinCanOpts {
  identifier: string;
  title: string;
  description?: string;
  launch?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildTinCanManifest(opts: TinCanOpts): string {
  const id = esc(opts.identifier || `https://chronicle.publisher/course/${Date.now()}`);
  const title = esc(opts.title || 'eLearning Course');
  const desc = esc(opts.description || '');
  const launch = esc(opts.launch || 'index.html');
  return `<?xml version="1.0" encoding="UTF-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="${id}" type="http://adlnet.gov/expapi/activities/course">
      <name lang="en-US">${title}</name>
      <description lang="en-US">${desc}</description>
      <launch lang="en-US">${launch}</launch>
    </activity>
  </activities>
</tincan>`;
}
