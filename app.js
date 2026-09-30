/* Bus Ticket Counter — all data stays in this browser (localStorage). */
(function () {
  'use strict';

  const SETTINGS_KEY = 'busTicket.settings';
  const HISTORY_KEY = 'busTicket.history';
  const COUNTER_KEY = 'busTicket.counter';

  const DEFAULT_SETTINGS = {
    company: 'My Bus Company',
    companyPhone: '',
    companyAddress: '',
    currency: 'Rs',
    prefix: 'TKT',
    cities: '',
    terms: [
      'Please arrive at the terminal 30 minutes before departure.',
      'Keep this ticket with you during the whole journey.',
      'Ticket is valid only for the date and time shown.',
      'Refund / change is subject to company policy.'
    ].join('\n')
  };

  // ---------- storage helpers ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  let settings = Object.assign({}, DEFAULT_SETTINGS, load(SETTINGS_KEY, {}));
  let history = load(HISTORY_KEY, []);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const form = $('#ticketForm');
  const stopsList = $('#stops');

  // ---------- tabs ----------
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach(b => b.classList.toggle('active', b === btn));
      $$('.view').forEach(v => v.classList.toggle('active', v.id === btn.dataset.view));
      if (btn.dataset.view === 'history') renderHistory();
    });
  });

  // ---------- formatting ----------
  function num(v) {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function money(n) {
    const fixed = Math.round(n * 100) / 100;
    const str = fixed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return (settings.currency ? settings.currency + ' ' : '') + str;
  }
  function fmtDate(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }
  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- settings ----------
  function applySettings() {
    $('#brandName').textContent = settings.company || 'Bus Ticket Counter';
    document.title = (settings.company || 'Bus') + ' — Ticket Counter';
    $$('.cur').forEach(el => { el.textContent = settings.currency || ''; });
    const list = $('#cityList');
    list.innerHTML = '';
    settings.cities.split('\n').map(s => s.trim()).filter(Boolean).forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      list.appendChild(o);
    });
    const sf = $('#settingsForm');
    Object.keys(DEFAULT_SETTINGS).forEach(k => {
      if (sf.elements[k]) sf.elements[k].value = settings[k];
    });
    updateTotals();
  }

  $('#settingsForm').addEventListener('submit', e => {
    e.preventDefault();
    const sf = e.target;
    Object.keys(DEFAULT_SETTINGS).forEach(k => {
      if (sf.elements[k]) settings[k] = sf.elements[k].value.trim();
    });
    save(SETTINGS_KEY, settings);
    applySettings();
    const ok = $('#settingsSaved');
    ok.classList.remove('hidden');
    setTimeout(() => ok.classList.add('hidden'), 1800);
  });

  $('#clearHistory').addEventListener('click', () => {
    if (confirm('Delete ALL saved tickets from this computer? This cannot be undone.')) {
      history = [];
      save(HISTORY_KEY, history);
      renderHistory();
    }
  });

  // ---------- stops ----------
  function updateStopsHint() {
    $('#noStops').classList.toggle('hidden', stopsList.children.length > 0);
  }
  function addStop(name, time) {
    const li = $('#stopTpl').content.firstElementChild.cloneNode(true);
    $('.stop-name', li).value = name || '';
    $('.stop-time', li).value = time || '';
    $('.stop-name', li).setAttribute('list', 'cityList');
    stopsList.appendChild(li);
    updateStopsHint();
    $('.stop-name', li).focus();
  }
  $('#addStop').addEventListener('click', () => addStop());
  stopsList.addEventListener('click', e => {
    const li = e.target.closest('.stop');
    if (!li) return;
    if (e.target.classList.contains('del')) li.remove();
    else if (e.target.classList.contains('up') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
    else if (e.target.classList.contains('down') && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
    updateStopsHint();
  });
  function getStops() {
    return $$('.stop', stopsList)
      .map(li => ({ name: $('.stop-name', li).value.trim(), time: $('.stop-time', li).value }))
      .filter(s => s.name);
  }

  // ---------- round trip + totals ----------
  const roundTrip = $('#roundTrip');
  function toggleReturn() {
    const on = roundTrip.checked;
    $('#returnBox').classList.toggle('hidden', !on);
    $('#returnFareLabel').classList.toggle('hidden', !on);
    $('#tRetRow').classList.toggle('hidden', !on);
    form.elements.returnDate.required = on;
    form.elements.returnTime.required = on;
    if (on && num(form.elements.returnFare.value) === 0) form.elements.returnFare.value = form.elements.fare.value;
    updateTotals();
  }
  roundTrip.addEventListener('change', toggleReturn);

  function calc(f) {
    const pax = Math.max(1, Math.floor(num(f.passengers)));
    const outbound = num(f.fare) * pax;
    const ret = f.roundTrip ? num(f.returnFare) * pax : 0;
    const extra = num(f.extra);
    const discount = num(f.discount);
    const total = Math.max(0, outbound + ret + extra - discount);
    return { pax, outbound, ret, extra, discount, total };
  }

  function readForm() {
    const e = form.elements;
    const v = name => (e[name] ? String(e[name].value).trim() : '');
    return {
      name: v('name'), phone: v('phone'), email: v('email'), idNumber: v('idNumber'),
      gender: v('gender'), passengers: v('passengers'), seats: v('seats'), emergency: v('emergency'),
      from: v('from'), to: v('to'), date: v('date'), time: v('time'),
      busNo: v('busNo'), busClass: v('busClass'),
      stops: getStops(),
      roundTrip: roundTrip.checked,
      returnDate: v('returnDate'), returnTime: v('returnTime'), returnBusNo: v('returnBusNo'),
      fare: v('fare'), returnFare: v('returnFare'), extra: v('extra'), discount: v('discount'),
      payment: v('payment'), agent: v('agent'), notes: v('notes')
    };
  }

  function updateTotals() {
    const t = calc(readForm());
    $('#tOut').textContent = money(t.outbound) + (t.pax > 1 ? ' (' + t.pax + ' seats)' : '');
    $('#tRet').textContent = money(t.ret);
    $('#tExtra').textContent = money(t.extra);
    $('#tDisc').textContent = '- ' + money(t.discount);
    $('#tTotal').textContent = money(t.total);
  }
  form.addEventListener('input', e => {
    if (e.target.classList) e.target.classList.remove('invalid');
    updateTotals();
  });

  // ---------- validation ----------
  function validate(f) {
    $$('.invalid', form).forEach(el => el.classList.remove('invalid'));
    const errors = [];
    const mark = (name, msg) => { form.elements[name].classList.add('invalid'); errors.push(msg); };

    if (!f.name) mark('name', 'Passenger name is required.');
    if (!f.phone) mark('phone', 'Phone number is required.');
    else if (!/^[+\d][\d\s-]{6,}$/.test(f.phone)) mark('phone', 'Phone number looks wrong.');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) mark('email', 'Email address looks wrong.');
    if (num(f.passengers) < 1) mark('passengers', 'At least 1 passenger.');
    if (!f.from) mark('from', 'Departure city is required.');
    if (!f.to) mark('to', 'Destination city is required.');
    if (!f.date) mark('date', 'Departure date is required.');
    if (!f.time) mark('time', 'Departure time is required.');
    if (num(f.fare) < 0) mark('fare', 'Fare cannot be negative.');
    if (f.roundTrip) {
      if (!f.returnDate) mark('returnDate', 'Return date is required for a round trip.');
      if (!f.returnTime) mark('returnTime', 'Return time is required for a round trip.');
      if (f.returnDate && f.date && (f.returnDate + f.returnTime) < (f.date + f.time)) {
        mark('returnDate', 'Return must be after departure.');
      }
    }
    return errors;
  }

  function nextTicketNo() {
    const d = new Date();
    const stamp = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const n = (load(COUNTER_KEY, 0) || 0) + 1;
    save(COUNTER_KEY, n);
    return (settings.prefix || 'TKT') + '-' + stamp + '-' + String(n).padStart(4, '0');
  }

  // ---------- submit ----------
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = readForm();
    const errors = validate(f);
    const box = $('#formError');
    if (errors.length) {
      box.innerHTML = errors.map(escapeHtml).join('<br>');
      box.classList.remove('hidden');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    box.classList.add('hidden');

    const ticket = Object.assign({}, f, {
      ticketNo: nextTicketNo(),
      issuedAt: new Date().toISOString(),
      totals: calc(f),
      company: {
        name: settings.company, phone: settings.companyPhone, address: settings.companyAddress,
        currency: settings.currency, terms: settings.terms
      }
    });
    history.unshift(ticket);
    save(HISTORY_KEY, history);

    const doc = buildPdf(ticket);
    doc.save(pdfName(ticket));
  });

  $('#resetBtn').addEventListener('click', () => {
    setTimeout(() => {
      stopsList.innerHTML = '';
      updateStopsHint();
      form.elements.date.value = todayIso();
      $$('.invalid', form).forEach(el => el.classList.remove('invalid'));
      $('#formError').classList.add('hidden');
      toggleReturn();
    });
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function pdfName(t) {
    const safe = t.name.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'passenger';
    return t.ticketNo + '_' + safe + '.pdf';
  }

  // ---------- PDF ----------
  // jsPDF built-in fonts only cover Latin-1, so strip anything outside it.
  function pdfText(s) {
    return String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
  }

  function buildPdf(t) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 14;
    const brand = [11, 92, 173];
    const muted = [107, 116, 134];
    const dark = [28, 36, 51];
    const co = t.company || {};
    const cur = co.currency ? co.currency + ' ' : '';
    const m = n => cur + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
    let y = 0;

    function ensure(h) {
      if (y + h > H - 16) {
        doc.addPage();
        y = 16;
      }
    }
    // `keep` = height of content that must stay on the same page as the title.
    function sectionTitle(text, keep) {
      ensure(12 + (keep || 12));
      doc.setFillColor(238, 243, 250);
      doc.rect(M, y, W - 2 * M, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...brand);
      doc.text(pdfText(text), M + 3, y + 5.6);
      y += 12;
    }
    // Two-column label/value grid.
    function fields(pairs) {
      const colW = (W - 2 * M) / 2;
      const shown = pairs.filter(p => p[1]);
      for (let i = 0; i < shown.length; i += 2) {
        ensure(11);
        [shown[i], shown[i + 1]].forEach((p, c) => {
          if (!p) return;
          const x = M + 3 + c * colW;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...muted);
          doc.text(pdfText(p[0]).toUpperCase(), x, y);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...dark);
          const val = doc.splitTextToSize(pdfText(p[1]), colW - 6)[0];
          doc.text(val, x, y + 5);
        });
        y += 11;
      }
    }
    function routeBlock(from, to, date, time, bus, stops) {
      ensure(22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...dark);
      const fromTxt = pdfText(from).toUpperCase();
      doc.text(fromTxt, M + 3, y + 6);
      const fw = doc.getTextWidth(fromTxt);
      // arrow
      const ax = M + 3 + fw + 4;
      doc.setDrawColor(...brand);
      doc.setLineWidth(0.8);
      doc.line(ax, y + 4, ax + 12, y + 4);
      doc.line(ax + 12, y + 4, ax + 9, y + 2);
      doc.line(ax + 12, y + 4, ax + 9, y + 6);
      doc.text(pdfText(to).toUpperCase(), ax + 16, y + 6);
      y += 13;
      fields([
        ['Date', fmtDate(date)],
        ['Departure time', fmtTime(time)],
        ['Bus No.', bus],
        ['Class', t.busClass]
      ]);

      // Route timeline
      const points = [{ name: from, time: time, main: true }]
        .concat(stops.map(s => ({ name: s.name, time: s.time })))
        .concat([{ name: to, main: true }]);
      ensure(10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(stops.length ? 'ROUTE & STOPS (' + stops.length + ')' : 'ROUTE (DIRECT, NO STOPS)', M + 3, y);
      y += 5;
      points.forEach((p, i) => {
        ensure(7);
        const cx = M + 6;
        doc.setDrawColor(...brand);
        doc.setLineWidth(0.6);
        if (i < points.length - 1) doc.line(cx, y, cx, y + 7);
        if (p.main) { doc.setFillColor(...brand); doc.circle(cx, y, 1.6, 'F'); }
        else { doc.setFillColor(255, 255, 255); doc.circle(cx, y, 1.3, 'FD'); }
        doc.setFont('helvetica', p.main ? 'bold' : 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...dark);
        const label = p.main ? pdfText(p.name) : (i + '. ' + pdfText(p.name));
        doc.text(label, cx + 5, y + 1.3);
        if (p.time) {
          doc.setTextColor(...muted);
          doc.text(fmtTime(p.time), W - M - 3, y + 1.3, { align: 'right' });
        }
        y += 7;
      });
      y += 2;
    }

    // ----- header band -----
    doc.setFillColor(...brand);
    doc.rect(0, 0, W, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(pdfText(co.name || 'Bus Ticket'), M, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const contact = [co.phone && 'Tel: ' + co.phone, co.address].filter(Boolean).join('   |   ');
    if (contact) doc.text(pdfText(contact), M, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(t.roundTrip ? 'ROUND TRIP TICKET' : 'BUS TICKET', W - M, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Ticket No: ' + pdfText(t.ticketNo), W - M, 20, { align: 'right' });
    doc.setFontSize(8);
    const issued = new Date(t.issuedAt);
    doc.text('Issued: ' + issued.toLocaleDateString('en-GB') + ' ' + issued.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), W - M, 26, { align: 'right' });
    y = 40;

    // ----- passenger -----
    sectionTitle('PASSENGER DETAILS');
    fields([
      ['Name', t.name],
      ['Phone', t.phone],
      ['Email', t.email],
      ['ID / CNIC', t.idNumber],
      ['Gender', t.gender],
      ['Passengers', String(t.totals.pax)],
      ['Seat No(s).', t.seats],
      ['Emergency contact', t.emergency]
    ]);

    // ----- outbound -----
    sectionTitle(t.roundTrip ? 'OUTBOUND JOURNEY' : 'JOURNEY');
    routeBlock(t.from, t.to, t.date, t.time, t.busNo, t.stops);

    // ----- return -----
    if (t.roundTrip) {
      sectionTitle('RETURN JOURNEY');
      // Same stops in reverse order; outbound stop times do not apply on the way back.
      const back = t.stops.slice().reverse().map(s => ({ name: s.name, time: '' }));
      routeBlock(t.to, t.from, t.returnDate, t.returnTime, t.returnBusNo || t.busNo, back);
    }

    // ----- fare -----
    const tt = t.totals;
    sectionTitle('FARE DETAILS', 6.5 * (2 + (t.roundTrip ? 1 : 0) + (tt.extra ? 1 : 0) + (tt.discount ? 1 : 0)) + 18);
    const rows = [[
      (t.roundTrip ? 'Outbound fare' : 'Fare') + '  (' + m(num(t.fare)) + ' x ' + tt.pax + ')', m(tt.outbound)
    ]];
    if (t.roundTrip) rows.push(['Return fare  (' + m(num(t.returnFare)) + ' x ' + tt.pax + ')', m(tt.ret)]);
    if (tt.extra) rows.push(['Extra charges', m(tt.extra)]);
    if (tt.discount) rows.push(['Discount', '- ' + m(tt.discount)]);
    doc.setFontSize(10);
    rows.forEach(r => {
      ensure(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...dark);
      doc.text(pdfText(r[0]), M + 3, y);
      doc.text(pdfText(r[1]), W - M - 3, y, { align: 'right' });
      y += 6.5;
    });
    ensure(16);
    doc.setDrawColor(...muted);
    doc.setLineWidth(0.2);
    doc.line(M + 3, y - 2, W - M - 3, y - 2);
    doc.setFillColor(...brand);
    doc.roundedRect(W - M - 75, y, 72, 11, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('TOTAL: ' + pdfText(m(tt.total)), W - M - 39, y + 7.5, { align: 'center' });
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Payment: ' + pdfText(t.payment || 'Cash') + '  -  PAID', M + 3, y + 5);
    if (t.agent) doc.text('Issued by: ' + pdfText(t.agent), M + 3, y + 10);
    y += 18;

    // ----- notes & terms -----
    function paragraph(title, body) {
      if (!body) return;
      ensure(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      doc.text(title, M + 3, y);
      y += 4.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...dark);
      body.split('\n').filter(s => s.trim()).forEach(line => {
        doc.splitTextToSize(pdfText(line.trim()), W - 2 * M - 10).forEach((l, i) => {
          ensure(4.5);
          doc.text((i === 0 ? '- ' : '  ') + l, M + 3, y);
          y += 4.2;
        });
      });
      y += 3;
    }
    paragraph('NOTES', t.notes);
    paragraph('TERMS & CONDITIONS', co.terms);

    // ----- footer on every page -----
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(...brand);
      doc.setLineWidth(0.4);
      doc.setLineDashPattern([2, 1.5], 0);
      doc.line(M, H - 12, W - M, H - 12);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text('Thank you for travelling with ' + pdfText(co.name || 'us') + '.  Have a safe journey!', M, H - 7);
      doc.text(pdfText(t.ticketNo) + (pages > 1 ? '   Page ' + p + '/' + pages : ''), W - M, H - 7, { align: 'right' });
    }

    doc.setProperties({ title: 'Ticket ' + t.ticketNo, subject: t.name, author: co.name || '' });
    return doc;
  }

  // ---------- history ----------
  function renderHistory() {
    const q = $('#search').value.trim().toLowerCase();
    const body = $('#historyBody');
    body.innerHTML = '';
    const list = history.filter(t => !q || [t.ticketNo, t.name, t.phone, t.email, t.from, t.to]
      .concat(t.stops.map(s => s.name)).join(' ').toLowerCase().includes(q));
    list.forEach(t => {
      const tr = document.createElement('tr');
      const cur = t.company && t.company.currency ? t.company.currency + ' ' : '';
      tr.innerHTML =
        '<td>' + escapeHtml(t.ticketNo) + '</td>' +
        '<td>' + escapeHtml(t.name) + '</td>' +
        '<td>' + escapeHtml(t.phone) + '</td>' +
        '<td>' + escapeHtml(t.from + ' → ' + t.to) + (t.stops.length ? ' <small>(' + t.stops.length + ' stops)</small>' : '') + '</td>' +
        '<td>' + escapeHtml(fmtDate(t.date) + ' ' + fmtTime(t.time)) + '</td>' +
        '<td>' + (t.roundTrip ? 'Round trip' : 'One way') + '</td>' +
        '<td>' + escapeHtml(cur + t.totals.total.toLocaleString('en-US')) + '</td>' +
        '<td><button class="btn" data-act="pdf">PDF</button> <button class="btn" data-act="copy">Re-use</button> <button class="btn danger" data-act="del">✕</button></td>';
      tr.addEventListener('click', e => {
        const act = e.target.dataset && e.target.dataset.act;
        if (act === 'pdf') buildPdf(t).save(pdfName(t));
        else if (act === 'copy') reuse(t);
        else if (act === 'del' && confirm('Delete ticket ' + t.ticketNo + '?')) {
          history = history.filter(h => h !== t);
          save(HISTORY_KEY, history);
          renderHistory();
        }
      });
      body.appendChild(tr);
    });
    $('#historyEmpty').classList.toggle('hidden', list.length > 0);
  }
  $('#search').addEventListener('input', renderHistory);

  // Fill the form from an old ticket (e.g. regular customer or same route).
  function reuse(t) {
    const e = form.elements;
    ['name', 'phone', 'email', 'idNumber', 'gender', 'passengers', 'seats', 'emergency', 'from', 'to',
      'date', 'time', 'busNo', 'busClass', 'returnDate', 'returnTime', 'returnBusNo',
      'fare', 'returnFare', 'extra', 'discount', 'payment', 'agent', 'notes'].forEach(k => {
      if (e[k]) e[k].value = t[k] || '';
    });
    stopsList.innerHTML = '';
    t.stops.forEach(s => addStop(s.name, s.time));
    updateStopsHint();
    roundTrip.checked = !!t.roundTrip;
    toggleReturn();
    $('.tab[data-view="newTicket"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- init ----------
  form.elements.date.value = todayIso();
  applySettings();
  updateStopsHint();
  toggleReturn();
})();
