const assert = require('node:assert/strict');
const { test } = require('node:test');
const catalog = require('../prompt-catalog');
const rules = require('../prompt-rules');

test('catalog renders existing defaults and keeps field-specific descriptions', () => {
    const fields = new Map(['param-type', 'param-style', 'param-outfit', 'param-human-cam-angle']
        .map(id => [id, { replaceChildren(...options) { this.options = options; } }]));
    catalog.mount({
        getElementById: id => fields.get(id),
        createElement: tag => ({ tag, append(...children) { this.children = children; } })
    });
    assert.equal(fields.get('param-type').value, 'human');
    assert.equal(fields.get('param-style').value, 'none');
    assert.equal(fields.get('param-outfit').value, 'none');
    assert.ok(fields.get('param-outfit').options.some(option => option.value === 'bodycon-dress'));
    assert.ok(fields.get('param-human-cam-angle').options.some(option => option.tag === 'optgroup'));
    assert.match(catalog.describe('param-style', 'y2k'), /flash photography/);
    assert.match(catalog.describe('param-outfit', 'y2k'), /low-rise jeans/);
    assert.match(catalog.describe('param-outfit', 'bodycon-dress'), /bodycon dress/);
});

test('Lab rules retain pose, reference, output and optics constraints', () => {
    const context = { core: { pose: 'sitting', sceneEffect: 'mist', sceneLight: 'daylight' },
        visual: { style: 'documentary', background: 'a neutral studio' } };
    for (const type of ['human', 'animal', 'scene']) {
        assert.match(rules.systemPrompt(type, 'spec', context), /documentary/);
    }
    assert.match(rules.systemPrompt('human', 'zimage', context), /ONE English prompt paragraph/);
    assert.match(rules.pose('t-pose'), /90 degrees/);
    assert.match(rules.humanIdentity('strict'), /STRICTLY MAINTAIN/);
    assert.match(rules.objectIntegrity('strict'), /exact geometry/);
    assert.match(rules.imageConstraints('arm-extended'), /No phone or camera visible/);
    assert.match(rules.negativePrompt('arm-extended', 'spec'), /Smartphone/);
    assert.equal(rules.negativePrompt('selfie', 'zimage'), '');
    assert.match(rules.opticsInstruction(['Rembrandt', '50mm'], 'spec'), /Rembrandt, 50mm/);
    const { LIGHT_PRESETS, LENS_PRESETS, DEFAULT_LIGHTING } = rules.optics;
    assert.deepEqual(rules.opticsFields['lt-preset'].options.map(([id]) => id), Object.keys(LIGHT_PRESETS));
    assert.deepEqual(rules.opticsFields['op-lens'].options.map(([id]) => id), Object.keys(LENS_PRESETS));
    assert.notEqual(DEFAULT_LIGHTING().volumetric, DEFAULT_LIGHTING().volumetric);
});

test('selected mood and palette become prompt instructions while auto is neutral', () => {
    const mood = catalog.describe('param-mood', 'serene');
    const palette = catalog.describe('param-palette', 'warm-earth');
    assert.match(rules.artDirection(mood, palette), /Mood: a calm[\s\S]*Color palette: peach, terracotta/);
    assert.match(rules.artDirection('none', palette), /preserving explicitly specified subject colors/);
    assert.equal(rules.artDirection('none', 'none'), '');
    assert.deepEqual(catalog.paletteColors('none'), []);
    assert.equal(catalog.paletteColors('warm-earth').length, 4);
});
