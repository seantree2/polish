// Spinner sound — the soft "pop" copied from the reference video. Bundled as pop.wav;
// plays on entrance and again on exit, only when Sound is enabled (passed as ?sound=1
// from the main process, which reads the Settings toggle fresh on every refine).
//
// PRIVACY: this page only ever shows a fixed "Polishing…" pill — none of your text or
// Claude's output is ever loaded here, so there is nothing sensitive in this window.
(function () {
  var soundOn = new URLSearchParams(location.search).get('sound') !== '0';
  function pop() {
    if (!soundOn) return;
    try {
      var a = new Audio('pop.wav');
      a.volume = 0.7;
      a.play().catch(function () {});
    } catch (e) { /* sound is best-effort */ }
  }
  // Entrance: the pill is fading in right now — play the pop alongside it.
  pop();
  // Exit: the main process calls this the instant a refine finishes. Play the pop and
  // add .bye to start the fade-out; main.js destroys the window once both have finished.
  window.polishExit = function () {
    pop();
    var p = document.querySelector('.pill');
    if (p) p.classList.add('bye');
  };
})();
