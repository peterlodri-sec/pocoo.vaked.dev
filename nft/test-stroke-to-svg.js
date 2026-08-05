'use strict';
import { strokeToSVG, strokeToSVGBody, mintPayload } from './strokeToSVG.js';

const sample = [
  [
    { x: 50, y: 60, tool: 'brush', color: '#ff69b4', size: 8 },
    { x: 120, y: 200, tool: 'brush', color: '#ff69b4', size: 8 },
    { x: 300, y: 240, tool: 'brush', color: '#ff69b4', size: 8 },
  ],
  [
    { x: 400, y: 100, tool: 'spray', color: '#a29bfe', size: 10 },
    { x: 410, y: 120, tool: 'spray', color: '#a29bfe', size: 10 },
  ],
  [{ x: 200, y: 300, tool: 'eraser', color: '#0a0410', size: 6 }],
];

let failures = 0;
function check(name, cond) {
  if (!cond) failures++;
  console.log((cond ? 'ok  ' : 'FAIL') + '  ' + name);
}

const svg = strokeToSVG(sample);
check('svg length sane (' + svg.length + ' bytes)', svg.length > 100);
check('starts <svg', svg.startsWith('<svg'));
check('viewBox 600x500', svg.includes('viewBox="0 0 600 500"'));
check('bg rect', svg.includes('<rect width="600" height="500" fill="#0a0410"/>'));
check('has path for brush', svg.includes('<path d="'));
check('has spray circles', (svg.match(/fill-opacity=/g) || []).length > 0);
check('has eraser-colored dot (bg fill)', svg.includes('fill="#0a0410"'));
check('ends </svg>', svg.trimEnd().endsWith('</svg>'));

const p = mintPayload(sample, 'test', 's3cr3t');
check('payload keys', JSON.stringify(Object.keys(p).sort()) === '["secret","strokes","svgBody","title"]');
check('strokes roundtrip length 3', JSON.parse(p.strokes).length === 3);
check('title', p.title === 'test');
check('secret', p.secret === 's3cr3t');

check('deterministic render', strokeToSVG(sample) === svg);

const empty = strokeToSVG([]);
check('empty body renders bg only', empty.includes('<rect') && !empty.includes('<path'));

const oneDot = strokeToSVG([[{ x: 10, y: 20, tool: 'brush', color: '#fff', size: 4 }]]);
check('single dot -> circle', oneDot.includes('<circle cx="10" cy="20" r="2"'));

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
