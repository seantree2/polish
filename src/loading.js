// Spinner sound — distinct soft sounds copied from the reference videos: a rising "ding"
// on entrance (pop-in.wav) and a "finish" sound on exit (pop-out.wav), each kept with its
// natural decay tail so it rings out instead of cutting off. Plays only when Sound is
// enabled (passed as ?sound=1 from the main process, read fresh on every refine).
//
// PRIVACY: this page only ever shows a fixed "Polishing…" pill — none of your text or
// Claude's output is ever loaded here, so there is nothing sensitive in this window.
(function () {
  var soundOn = new URLSearchParams(location.search).get('sound') !== '0';
  function pop(file) {
    if (!soundOn) return;
    try {
      var a = new Audio(file);
      a.volume = 0.7;
      a.play().catch(function () {});
    } catch (e) { /* sound is best-effort */ }
  }
  // Entrance: the soft rising "ding" as the pill fades in.
  pop('pop-in.wav');
  // Exit: the main process calls this the instant a refine finishes. Play the distinct
  // "finish" sound and add .bye to start the fade-out; main.js keeps the window alive
  // until the sound's tail has fully rung out, then destroys it.
  window.polishExit = function () {
    pop('pop-out.wav');
    var p = document.querySelector('.pill');
    if (p) p.classList.add('bye');
  };
})();
