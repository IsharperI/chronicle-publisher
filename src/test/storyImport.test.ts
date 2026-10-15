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
const MP3 = new TextEncoder().encode('ID3 not really audio');
const rich = (text: string, style = '') => `<Document><Content><Block><Span Text="${text}"><Style ${style} /></Span></Block></Content></Document>`
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tm = (start: number, dur: number, untilEnd = false) => `<tmCtxLst><tmCtx start="${start}" dur="${dur}" untilEnd="${untilEnd}" /></tmCtxLst>`;
const loc = (l: number, t: number, r: number, b: number) => `<loc l="${l}" t="${t}" r="${r}" b="${b}" />`;

async function makeStory(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('story/media/Rabc.png', PNG);
  zip.file('story/media/Rsnd.mp3', MP3);
  zip.file('story/_rels/story.xml.rels', `<Relationships>
    <Relationship Type="slide" Target="/story/slides/slide.xml" Id="R111" />
    <Relationship Type="slide" Target="/story/slides/slide2.xml" Id="R222" />
    <Relationship Type="slide" Target="/story/slides/slide3.xml" Id="R333" /></Relationships>`);
  zip.file('story/story.xml', `<story>
    <varLst>
      <var g="v1" name="Score" dataType="num" val="0" type="user" />
      <var g="v2" name="Player.Volume" dataType="num" val="0" type="builtIn" />
    </varLst>
    <mediaLst><mediaLst><media g="img1" displayName="photo.png"><md5Checksum><stream>${md5Hex(PNG)}</stream></md5Checksum></media>
      <audio g="aud1" displayName="voice.mp3"><md5Checksum><stream>${md5Hex(MP3)}</stream></md5Checksum></audio></mediaLst></mediaLst>
    <sceneLst>
      <scene g="sc1" name="Intro"><sldIdLst><sldId>R111</sldId></sldIdLst></scene>
      <scene g="sc2" name="End"><sldIdLst><sldId>R222</sldId><sldId>R333</sldId></sldIdLst></scene>
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
  zip.file('story/slides/slide2.xml', `<sld g="s2" name="Goodbye" layoutG="lay1"><tmProps min="12000" /><shapeLst>
    <rect g="tb1" zOrder="0">${loc(10, 10, 300, 100)}<table><columns><tableColumn /><tableColumn /></columns><rows>
      <tableRow><cells><tableCell text="${rich('A')}" /><tableCell text="${rich('B')}" /></cells></tableRow>
      <tableRow><cells><tableCell text="${rich('1', 'ForegroundColor="#333333"')}" /><tableCell text="${rich('2')}" /></cells></tableRow>
    </rows></table></rect>
    <textBox g="t2" zOrder="1">${tm(0, 1000)}${loc(10, 200, 400, 260)}<text>${rich('Back')}</text>
      <trigLst><trig><data event="OnClick" action="jumpToScene" actSubType="spec"><scene jumpG="sc1" /></data><condLst /></trig></trigLst></textBox>
    <group g="grp" zOrder="2">${tm(9000, 500)}${loc(0, 0, 500, 500)}<animEffect><entr><wipe dur="PT1S" wd="b" /></entr></animEffect><childLst><g>m1</g></childLst></group>
    <rect g="m1" zOrder="0" parentG="grp">${tm(2000, 3000)}${loc(0, 0, 100, 100)}<bG><solidFill><clr><srgbClr val="123456" /></clr></solidFill></bG>
      <animEffect><exit><wipe dur="PT0.5S" wd="r" /></exit></animEffect></rect>
    <sound g="snd1" zOrder="3" assetG="aud1">${tm(1500, 2000)}</sound>
  </shapeLst>
  <sldLayerLst><sldLayer g="L2" name="Popup"><tmProps min="4000" /><shapeLst>
    <sound g="snd2" zOrder="0" assetG="aud1">${tm(250, 1000)}</sound>
  </shapeLst></sldLayer></sldLayerLst></sld>`);
  const fill = (hex: string) => `<bG><solidFill><clr><srgbClr val="${hex}" /></clr></solidFill></bG>`;
  zip.file('story/slides/slide3.xml', `<sld g="s3" name="States" layoutG="lay1"><shapeLst>
    <roundRect g="chk" zOrder="0" initState="Disabled" grpId="set1">${tm(0, 5000)}${loc(10, 10, 110, 50)}${fill('0000FF')}<text>${rich('Pick')}</text>
      <stateLst>
        <state name="Normal"><shapeLst><roundRect g="chkN">${fill('0000FF')}<text>${rich('Pick')}</text></roundRect></shapeLst></state>
        <state name="Selected" defG="chkS"><shapeLst><pic g="tick" assetG="img1" zOrder="2">${loc(80, 5, 95, 20)}</pic>
          <roundRect g="chkS" zOrder="1">${fill('00FF00')}<text>${rich('Picked')}</text></roundRect></shapeLst></state>
        <state name="Disabled"><shapeLst><roundRect g="chkD">${fill('0000FF')}<text>${rich('Pick')}</text></roundRect>
          <pic g="tick2" assetG="img1">${loc(80, 5, 95, 20)}</pic></shapeLst></state>
      </stateLst>
      <trigLst><trig><data event="OnClick" action="changeShapeState"><shape setStateG="msg" setStateName="Normal" /></data>
        <condLst><trigCond dataType="state" andOr="and"><shapeState shapeG="chk" op="eq" name="Selected" /></trigCond></condLst></trig></trigLst>
    </roundRect>
    <textBox g="msg" zOrder="1" initState="Hidden">${tm(0, 5000)}${loc(10, 100, 300, 150)}<text>${rich('Done')}</text></textBox>
  </shapeLst>
  <sldLayerLst><sldLayer g="L3" name="Info"><shapeLst><rect g="r3" zOrder="0">${tm(0, 1000)}${loc(0, 0, 10, 10)}${fill('EEEEEE')}</rect></shapeLst>
    <trigLst><trig><data event="OnStart" action="changeShapeState"><shape setStateG="chk" setStateName="Normal" /></data><condLst /></trig></trigLst></sldLayer></sldLayerLst>
  <trigLst>
    <trig><data event="OnStateChange" action="changeShapeState"><shape setStateG="msg" setStateName="Normal" stateInclude="any" statesNot="are" stateName="Selected"><stateLst><g>chk</g></stateLst></shape></data><condLst /></trig>
    <trig><data event="OnTimelineEvent" action="changeShapeState"><shape setStateG="chk" setStateName="Normal" /><other time="PT1.5S" /></data><condLst /></trig>
  </trigLst></sld>`);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('importStory', () => {
  it('converts a small .story into a loadable Chronicle course', async () => {
    const { payload, report } = await importStory(await makeStory());
    const course = sanitizeProject(payload)!;
    expect(course).not.toBeNull();
    expect(payload.playerSettings?.courseTitle).toBe('Test & Course');
    expect(course.slides.map((s) => [s.id, s.title, s.group])).toEqual([['111', 'Welcome', 'Intro'], ['222', 'Goodbye', 'End'], ['333', 'States', 'End']]);
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
    expect(btn.states).toEqual([{ name: 'Hover', look: { fillColor: '#FF0000' } }]);
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

    // Timing: the slide uses Storyline's own length; grouped objects keep their own timing but
    // play the group's animations; audio keeps its start time; layer audio belongs to its layer.
    expect(s2.duration).toBe(12000);
    const member = s2.layers![0].elements.find((e) => e.id === 'm1')!;
    expect([member.startTime, member.duration]).toEqual([2000, 3000]);
    expect([member.animationIn, member.entranceDuration]).toEqual(['wipe-from-bottom', 1000]);
    expect(member.animationOut).toBe('wipe-to-left');
    expect(s2.audio).toEqual([expect.objectContaining({ id: 'snd1', startTime: 1.5, duration: 2 })]);
    expect(s2.layers![1].audio).toEqual([expect.objectContaining({ id: 'snd2', startTime: 0.25, duration: 1 })]);

    const messages = report.issues.map((i) => i.message);
    expect(messages).toContain('Freeform shapes');
    expect(messages).toContain("Trigger: Change state of the player's Next button");
    expect(report.slides).toBe(3);
    expect(report.triggersConverted).toBe(8);
    // A layer's "when timeline starts" trigger goes on its first object (it runs when the layer is shown).
    expect(course.slides[2].layers![1].elements[0].triggers).toEqual([{ event: 'timelineStart', action: 'changeState', targetId: 'chk', state: 'Normal' }]);

    // States: looks (as differences from Normal), initial states, button sets, state triggers and conditions.
    const [chk, tick, msg] = course.slides[2].layers![0].elements as [ShapeElement, ImageElement, TextElement];
    // A picture inside two of its states (placed relative to the button, drawn over it): one object,
    // shown in those states, with the button's timing.
    expect(tick).toMatchObject({ id: 'tick', type: 'image', x: 90, y: 15, stateParent: { id: 'chk', states: ['Selected', 'Disabled'] } });
    expect([tick.startTime, tick.duration]).toEqual([chk.startTime, chk.duration]);
    expect(chk.text).toBe('Pick');
    expect(chk.states).toEqual([{ name: 'Selected', look: { fillColor: '#00FF00', text: 'Picked' } }, { name: 'Disabled', look: {} }]);
    expect([chk.initialState, chk.buttonSet]).toEqual(['Disabled', 'set1']);
    expect([msg.initialState, msg.states]).toEqual(['Hidden', [{ name: 'Hidden', look: {} }]]);
    expect(chk.triggers).toEqual([
      { event: 'onClick', action: 'changeState', targetId: 'msg', state: 'Normal',
        conditions: [{ variableId: '', elementId: 'chk', operator: 'equals', state: 'Selected', value: '' }] },
      // slide triggers go on the slide's first object
      { event: 'stateChange', action: 'changeState', targetId: 'msg', state: 'Normal', stateWatch: { ids: ['chk'], state: 'Selected', any: true } },
      { event: 'atTime', action: 'changeState', targetId: 'chk', state: 'Normal', time: 1.5 },
    ]);
  });

  it('rejects files that are not .story files', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(importStory(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/story/);
  });
});
