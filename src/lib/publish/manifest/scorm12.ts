export interface Scorm12ManifestOpts {
  identifier: string;
  version: string;
  title: string;
  lessonTitle: string;
  description?: string;
  duration?: string; // PT format
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildScorm12Manifest(opts: Scorm12ManifestOpts): string {
  const id = esc(opts.identifier || 'course_manifest');
  const ver = esc(opts.version || '1.0');
  const title = esc(opts.title || 'eLearning Course');
  const lesson = esc(opts.lessonTitle || title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="${ver}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
    http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org_1">
    <organization identifier="org_1">
      <title>${title}</title>
      <item identifier="item_1" identifierref="res_1">
        <title>${lesson}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>`;
}
