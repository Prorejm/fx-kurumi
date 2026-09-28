/* ============================================================================
 * data/lang/override.en.js —— Kurumi edition · English tone override（本版専属）
 * ----------------------------------------------------------------------------
 * Loaded after the base dictionary ⇒ same-key values win.
 * ========================================================================== */
window.I18N_DICT = window.I18N_DICT || {};
Object.assign(window.I18N_DICT, {
  'en-US': Object.assign(window.I18N_DICT['en-US'] || {}, {

    'common.ok': 'Yep!',

    'char.tone.greeting': "Hey hey~ let's ride again today!"
  })
});
