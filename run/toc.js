/* A section index for the long pages, built from what is already on them.

   These instruments run to eight and nine thousand pixels. The reader who
   wants the certificate cost has to scroll past the line items, the threshold
   and the data gaps to reach it, and the reader who has reached it has no way
   back to the input that produced it except the scrollbar. A document this
   long in print would have a contents page; on screen it gets a rail that
   also says where you are.

   Everything here is additive. It reads the headings the page already has,
   builds a nav beside them, and touches nothing else: no tool's markup is
   changed and no tool's logic can see it. If the script does not run, the page
   is exactly what it was.

   It only appears where there is room for it, which means a wide screen and at
   least three sections. Below that it would be a second navigation competing
   with the first, and on a phone it would simply be in the way. */

(function () {
  "use strict";

  var MIN_WIDTH = 1400;
  var MIN_SECTIONS = 3;

  function build() {
    var wrap = document.querySelector(".k-wrap");
    if (!wrap) return;

    var sections = [].slice.call(document.querySelectorAll(".k-sect"));
    if (sections.length < MIN_SECTIONS) return;

    var items = [];
    sections.forEach(function (sec, i) {
      var h = sec.querySelector("h2");
      if (!h) return;
      if (!sec.id) sec.id = "sect-" + (i + 1);

      /* the number is a separate span inside the heading; the label is what is
         left once it is taken out, and it has to be read rather than assumed
         because these pages are published in three languages */
      var num = h.querySelector(".k-num");
      var label = h.textContent.replace(num ? num.textContent : "", "").trim();
      items.push({ sec: sec, label: label, num: num ? num.textContent.trim() : String(i + 1) });
    });
    if (items.length < MIN_SECTIONS) return;

    var nav = document.createElement("nav");
    nav.className = "k-toc";
    nav.setAttribute("aria-label", document.documentElement.lang === "de" ? "Abschnitte" : document.documentElement.lang === "tr" ? "Bölümler" : "Sections");

    var ul = document.createElement("ul");
    items.forEach(function (it) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + it.sec.id;
      a.innerHTML = '<span class="k-toc-n"></span><span class="k-toc-l"></span>';
      a.querySelector(".k-toc-n").textContent = it.num;
      a.querySelector(".k-toc-l").textContent = it.label;
      it.link = a;
      li.appendChild(a);
      ul.appendChild(li);
    });
    nav.appendChild(ul);
    document.body.appendChild(nav);

    /* Which section is current: the last one whose top has passed a line a
       third of the way down the viewport. An observer would fire on whichever
       section happened to intersect, which on a page where one section is
       three thousand pixels tall is not the same question. */
    var ticking = false;
    function mark() {
      ticking = false;
      var line = window.innerHeight * 0.33;
      var current = items[0];
      for (var i = 0; i < items.length; i++) {
        if (items[i].sec.getBoundingClientRect().top <= line) current = items[i];
      }
      items.forEach(function (it) {
        it.link.setAttribute("aria-current", it === current ? "true" : "false");
      });
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(mark);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    mark();
  }

  function start() {
    if (window.innerWidth < MIN_WIDTH) return;
    build();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
