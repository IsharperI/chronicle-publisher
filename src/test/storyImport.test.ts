import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { importStory } from '@/lib/storyImport';
import { md5Hex } from '@/lib/storyImport/md5';
import { sanitizeProject } from '@/lib/project';
import type { ImageElement, ShapeElement, TableElement, TextElement } from '@/types/course';

describe('md5Hex', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('matches known digests', () => {
    expect(md5Hex(enc(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex(enc('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex(enc('The quick brown fox jumps over the lazy dog'))).toBe('9e107d9d372bb6826bd81d3542a419d6');
    expect(md5Hex(enc('x'.repeat(1000)))).toBe('398533d48111e9f664b1f64cb10c4b63');
  });
});

// A tiny hand-made .story: one master + layout, two scenes, a slide with a layer.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const rich = (text: string, style = '') => `<Document><Content><Block><Span Text="${text}"><Style ${style} /></Span></Block></Content></Document>`
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tm = (start: number, dur: number, untilEnd = false) => `<tmCtxLst><tmCtx start="${start}" dur="${dur}" untilEnd="${untilEnd}" /></tmCtxLst>`;
const loc = (l: number, t: number, r: number, b: number) => `<loc l="${l}" t="${t}" r="${r}" b="${b}" />`;

async function makeStory(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('story/media/Rabc.png', PNG);
  zip.file('story/_rels/story.xml.rels', `<Relationships>
    <Relationship Type="slide" Target="/story/slides/slide.xml" Id="R111" />
    <Relationship Type="slide" Target="/story/slides/slide2.xml" Id="R222" /></Relationships>`);
  zip.file('story/story.xml', `<story>
    <varLst>
      <var g="v1" name="Score" dataType="num" val="0" type="user" />
      <var g="v2" name="Player.Volume" dataType="num" val="0" type="builtIn" />
    </varLst>
    <mediaLst><mediaLst><media g="img1" displayName="photo.png"><md5Checksum><stream>${md5Hex(PNG)}</stream></md5Checksum></media></mediaLst></mediaLst>
    <sceneLst>
      <scene g="sc1" name="Intro"><sldIdLst><sldId>R111</sldId></sldIdLst></scene>
      <scene g="sc2" name="End"><sldIdLst><sldId>R222</sldId></sldIdLst></scene>
    </sceneLst></story>`);
  zip.file('story/playerProps.xml', '<props><option name="title_text" value="Test &amp; Course" /></props>');
  zip.file('story/slideMasters/slideMaster.xml', `<master g="m1" name="Clean">
    <clrLst><dk1><srgbClr val="000000" /></dk1><lt1><srgbClr val="FFFFFF" /></lt1><dk2><srgbClr val="173A64" /></dk2><accent1><srgbClr val="007CBA" /></accent1></clrLst>
    <fonts major="Inter" minor="Inter" />
    <layoutIdLst><sldId>RL1</sldId></layoutIdLst>
    <shapeLst><rect g="mbar" zOrder="0">${tm(0, 5000)}<bG><solidFill><clr><schemeClr val="accent1" /></clr></solidFill></bG>${loc(0, 0, 1280, 80)}</rect></shapeLst></master>`);
  zip.file('story/slideMasters/_rels/slideMaster.xml.rels', '<Relationships><Relationship Type="slideLayout" Target="/story/slideLayouts/slideLayout.xml" Id="RL1" /></Relationships>');
  zip.file('story/slideLayouts/slideLayout.xml', `<layout g="L1" internalG="lay1" name="Title Only"><shapeLst>
    <ph g="ph1" zOrder="0"><defaults sz="30"><foreClr><schemeClr val="lt1" /></foreClr></defaults>${loc(0, 0, 10, 10)}</ph></shapeLst></layout>`);
  zip.file('story/slides/slide.xml', `<sld g="s1" name="Welcome" layoutG="lay1"><sz w="1280" h="720" />
    <shapeLst>
      <textBox g="t1" zOrder="2">${tm(0, 5000, true)}<sldSz w="1280" h="720" />${loc(100, 100, 600, 200)}<text>${rich('Hello', 'FontSize="27"')}</text><ph g="ph1" /></textBox>
      <roundRect g="b1" zOrder="1">${tm(500, 4500)}${loc(100, 300, 300, 360)}<bG><solidFill><clr><schemeClr val="dk2" /><grad val="6" /></clr></solidFill></bG>
        <stateLst><state name="Hover"><shapeLst><roundRect g="b1h"><bG><solidFill><clr><srgbClr val="FF0000" /></clr></solidFill></bG></roundRect></shapeLst></state></stateLst>
        <text>${rich('Go')}</text>
        <trigLst>
          <trig><data event="OnClick" action="showSubSlide" actSubType="spec"><sldLayer showG="lay-g1" /></data><condLst /></trig>
          <trig><data event="OnClick" action="adjustVar" actSubType="spec"><other varG="v1" op="add" dblVal="5" /></data>
            <condLst><trigCond varG="v1" op="lt" floatVal1="10" dataType="value" andOr="and" /></condLst></trig>
          <trig><data event="OnClick" action="changeShapeState" actSubType="next"><shape /></data><condLst /></trig>
        </trigLst></roundRect>
      <pic g="p1" zOrder="0" assetG="img1">${tm(0, 2000)}${loc(700, 100, 1100, 400)}<animEffect><entr><fly dur="PT0.5S" dir="l" /></entr></animEffect></pic>
      <freeForm g="f1" zOrder="3">${loc(0, 0, 10, 10)}</freeForm>
    </shapeLst>
    <sldLayerLst><sldLayer g="lay-g1" name="Details"><shapeLst>
      <rect g="r2" zOrder="0">${tm(0, 3000)}${loc(200, 200, 800, 500)}<bG><solidFill><clr><srgbClr val="EEEEEE" /><alpha val="50000" /></clr></solidFill></bG>
        <trigLst><trig><data event="OnClick" action="hideSubSlide" actSubType="me"><sldLayer /></data><condLst /></trig></trigLst></rect>
    </shapeLst></sldLayer></sldLayerLst>
    <trigLst><trig><data event="OnNextButtonClick" action="jumpToSlide" actSubType="next"><slide /></data></trig></trigLst></sld>`);
  zip.file('story/slides/slide2.xml', `<sld g="s2" name="Goodbye" layoutG="lay1"><shapeLst>
    <rect g="tb1" zOrder="0">${loc(10, 10, 300, 100)}<table><columns><tableColumn /><tableColumn /></columns><rows>
      <tableRow><cells><tableCell text="${rich('A')}" /><tableCell text="${rich('B')}" /></cells></tableRow>
      <tableRow><cells><tableCell text="${rich('1', 'ForegroundColor="#333333"')}" /><tableCell text="${rich('2')}" /></cells></tableRow>
    </rows></table></rect>
    <textBox g="t2" zOrder="1">${tm(0, 1000)}${loc(10, 200, 400, 260)}<text>${rich('Back')}</text>
      <trigLst><trig><data event="OnClick" action="jumpToScene" actSubType="spec"><scene jumpG="sc1" /></data><condLst /></trig></trigLst></textBox>
  </shapeLst></sld>`);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('importStory', () => {
  it('converts a small .story into a loadable Chronicle course', async () => {
    const { payload, report } = await importStory(await makeStory());
    const course = sanitizeProject(payload)!;
    expect(course).not.toBeNull();
    expect(payload.playerSettings?.courseTitle).toBe('Test & Course');
    expect(course.slides.map((s) => [s.id, s.title, s.group])).toEqual([['111', 'Welcome', 'Intro'], ['222', 'Goodbye', 'End']]);
    expect(course.variables).toEqual([{ id: 'v1', name: 'Score', type: 'number', defaultValue: 0 }]);

    // Master: background bar from the master, used by both slides.
    expect(course.masterSlides).toHaveLength(1);
    const master = course.masterSlides![0];
    expect(course.slides.every((s) => s.masterId === master.id)).toBe(true);
    expect((master.elements[0] as ShapeElement).fillColor).toBe('#007CBA');

    const [s1, s2] = course.slides;
    expect(s1.layers!.map((l) => [l.name, l.visible])).toEqual([['Base Layer', true], ['Details', false]]);
    const base = s1.layers![0].elements;
    expect(base.map((e) => e.type)).toEqual(['image', 'shape', 'text']); // stacking order, freeform skipped

    const pic = base[0] as ImageElement;
    expect(pic.src.startsWith('data:image/png;base64,')).toBe(true);
    expect(pic.fit).toBe('fill');
    expect(pic.animationIn).toBe('fly-in-left');
    expect(pic.alt).toBe('photo.png');

    const btn = base[1] as ShapeElement;
    expect(btn.text).toBe('Go');
    expect(btn.hoverFillColor).toBe('#ff0000'.toUpperCase());
    expect(btn.fillColor).toMatch(/^#[0-9a-f]{6}$/); // lighter variant of dark blue
    expect(parseInt(btn.fillColor.slice(1, 3), 16)).toBeGreaterThan(150);
    expect(btn.triggers).toEqual([
      { event: 'onClick', action: 'showLayer', targetId: 'lay-g1' },
      { event: 'onClick', action: 'adjustVariable', targetId: '', variableId: 'v1', variableOperator: 'add', variableValue: 5,
        conditions: [{ variableId: 'v1', operator: 'lessThan', value: 10 }] },
    ]);

    // Placeholder text inherits the layout's colour; size is scaled to px; "until end" lasts the whole slide.
    const title = base[2] as TextElement;
    expect(title.content).toBe('Hello');
    expect(title.textColor).toBe('#FFFFFF');
    expect(title.fontSize).toBe(48);
    expect(title.startTime + title.duration).toBe(s1.duration);
    expect(s1.duration).toBe(5000);

    const layerRect = s1.layers![1].elements[0] as ShapeElement;
    expect(layerRect.fillColor).toBe('#EEEEEE80');
    expect(layerRect.triggers).toEqual([{ event: 'onClick', action: 'hideLayer', targetId: 'lay-g1' }]);

    const table = s2.elements[0] as TableElement;
    expect(table.type).toBe('table');
    expect(table.cellData).toEqual([['A', 'B'], ['1', '2']]);
    expect(table.textColor).toBe('#333333');
    expect(s2.elements[1].triggers).toEqual([{ event: 'onClick', action: 'jumpToSlide', targetId: '111' }]);

    const messages = report.issues.map((i) => i.message);
    expect(messages).toContain('Freeform shapes');
    expect(messages).toContain('Trigger: Change state');
    expect(report.slides).toBe(2);
    expect(report.triggersConverted).toBe(4);
  });

  it('rejects files that are not .story files', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(importStory(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/story/);
  });
});
