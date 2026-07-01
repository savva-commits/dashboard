  // Declared first so any code that runs during initial page load (calendar,
  // WHOOP, training-plan rendering) can safely read these before the Week
  // tab's own init code further down ever executes.
  let weekPlanCache = null;
  let weekPlanCacheKey = null;
  const PA_NEEDS_REPLY_COUNT_KEY = 'pa_needs_reply_count';

  // ---- Animation helpers (used by the Home hero, micro-interactions etc) ----
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Counts a number up from 0 to endValue inside el, easing out, respecting
  // prefers-reduced-motion (jumps straight to the end value if set).
  function animateCountUp(el, endValue, duration, opts) {
    opts = opts || {};
    if (!el) return;
    if (endValue === null || endValue === undefined || Number.isNaN(Number(endValue))) {
      el.textContent = '--';
      return;
    }
    const end = Number(endValue);
    const format = v => opts.decimals ? v.toFixed(opts.decimals) : String(Math.round(v));
    if (prefersReducedMotion()) {
      el.textContent = format(end);
      if (opts.onUpdate) opts.onUpdate(end);
      return;
    }
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = end * eased;
      el.textContent = format(current);
      if (opts.onUpdate) opts.onUpdate(current);
      if (t < 1) requestAnimationFrame(tick);
      else { el.textContent = format(end); if (opts.onUpdate) opts.onUpdate(end); }
    }
    requestAnimationFrame(tick);
  }

  // Small radiating dot burst from a tick-off control (Training targets,
  // Gym set-checks). The anchor must be position:relative so the dots —
  // positioned absolute at its center — land in the right place.
  function spawnTickBurst(anchorEl) {
    if (prefersReducedMotion() || !anchorEl) return;
    const angles = [-60, -20, 20, 60, 90];
    const dist = 16;
    angles.forEach(deg => {
      const dot = document.createElement('span');
      dot.className = 'tick-burst-dot';
      const rad = deg * Math.PI / 180;
      dot.style.setProperty('--bx', (Math.sin(rad) * dist).toFixed(1) + 'px');
      dot.style.setProperty('--by', (-Math.cos(rad) * dist).toFixed(1) + 'px');
      anchorEl.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    });
  }

  document.getElementById('topbarDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  // ---- Settings: layout preference (mobile/desktop) ----
  const LAYOUT_PREF_KEY = 'layout_preference';

  function applyLayout(layout) {
    document.body.setAttribute('data-layout', layout);
    document.querySelectorAll('#layoutSegmented .segmented-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.layout === layout);
    });
  }

  function initLayout() {
    const saved = localStorage.getItem(LAYOUT_PREF_KEY);
    const layout = saved || (window.innerWidth >= 900 ? 'desktop' : 'mobile');
    applyLayout(layout);
  }
  initLayout();

  document.querySelectorAll('#layoutSegmented .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem(LAYOUT_PREF_KEY, btn.dataset.layout);
      applyLayout(btn.dataset.layout);
    });
  });

  // ---- Settings: dark mode ----
  const THEME_KEY = 'theme';

  function applyTheme(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.classList.toggle('on', theme === 'dark');
  }

  function initTheme() {
    applyTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');
  }
  initTheme();

  document.getElementById('darkModeToggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  const settingsOverlay = document.getElementById('settingsOverlay');
  document.getElementById('settingsGearBtn').addEventListener('click', () => {
    settingsOverlay.classList.add('open');
  });
  document.getElementById('settingsCloseBtn').addEventListener('click', () => {
    settingsOverlay.classList.remove('open');
  });
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
  });

  const tabButtons = document.querySelectorAll('nav.tabbar button');
  const tabButtonsArr = Array.from(tabButtons);
  const panels = document.querySelectorAll('.tab-panel');
  const navIndicator = document.getElementById('navIndicator');

  function moveNavIndicator(btn) {
    if (!navIndicator) return;
    const idx = tabButtonsArr.indexOf(btn);
    navIndicator.style.transform = `translateX(${idx * 100}%)`;
  }
  moveNavIndicator(tabButtonsArr[0]);

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      moveNavIndicator(btn);
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // Pull the latest food log whenever the Nutrition tab is opened, so
      // changes made on another device while this tab was already open
      // show up without needing a full page reload.
      if (btn.dataset.tab === 'nutrition' && typeof syncFoodLogFromRemote === 'function') {
        syncFoodLogFromRemote();
        syncSavedRecipesFromRemote().then(renderRecipeList);
      }
      if (btn.dataset.tab === 'training' && typeof syncWeeklyTargetsFromRemote === 'function') {
        syncWeeklyTargetsFromRemote().then(updateTrainingPlan);
      }
      if (btn.dataset.tab === 'gym' && typeof syncRunningPbsFromRemote === 'function') {
        Promise.all([syncRunningPbsFromRemote(), syncGym1rmsFromRemote(), syncExerciseWeightsFromRemote(), syncWorkoutHistoryFromRemote()])
          .then(() => { renderRunningPbs(); renderGym1rms(); renderWorkoutLibrary(); });
      }
      if (btn.dataset.tab === 'week' && typeof loadWeekTab === 'function') {
        loadWeekTab();
      }
      if (btn.dataset.tab === 'pa' && typeof loadPaTab === 'function') {
        loadPaTab();
      }
      if (btn.dataset.tab === 'home' && typeof replayHomeIntroAnimation === 'function') {
        replayHomeIntroAnimation();
      }
    });
  });

  function replayHomeIntroAnimation() {
    document.querySelectorAll('.home-intro').forEach(el => {
      el.classList.remove('home-intro');
      void el.offsetWidth;
      el.classList.add('home-intro');
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => reg.update());
    });
    // Once a new service worker takes over (e.g. after this deploy), reload
    // once so the page actually picks up the new code instead of continuing
    // to run whatever version happened to be loaded when it activated.
    let swRefreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swRefreshed) return;
      swRefreshed = true;
      window.location.reload();
    });
  }

  window.addEventListener('load', () => updateTrainingPlan());

  // ---- Google Calendar sync ----
  // Create an OAuth 2.0 Client ID (type: Web application) at
  // https://console.cloud.google.com/apis/credentials
  // Authorized JavaScript origin: https://savva-commits.github.io
  // Authorized redirect URI:      https://savva-commits.github.io/dashboard/
  // Then paste the Client ID below.
  const GOOGLE_CLIENT_ID = '581684498992-36jf2drdl17rikcps3dudhmss7vmuu23.apps.googleusercontent.com';
  const CALENDAR_ID = 'savva@ssmotorsport.uk';
  // v2 adds Gmail read/send on top of the original calendar-only scope.
  // Existing tokens were granted under v1 and won't include Gmail access,
  // so getStoredToken() below checks the stored scope version and forces
  // a fresh consent prompt (rather than a silent token refresh) whenever
  // it doesn't match — that's what lets the PA tab work for anyone who
  // connected Calendar before this change shipped.
  const GOOGLE_SCOPE = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
  ].join(' ');
  const GOOGLE_SCOPE_VERSION = '2';
  const TOKEN_KEY = 'gcal_token';
  const TOKEN_SCOPE_VERSION_KEY = 'gcal_token_scope_version';

  function getStoredToken() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      if (localStorage.getItem(TOKEN_SCOPE_VERSION_KEY) !== GOOGLE_SCOPE_VERSION) return null;
      const token = JSON.parse(raw);
      if (token.expires_at && Date.now() < token.expires_at) return token;
      return null;
    } catch (e) { return null; }
  }

  function storeToken(tokenResponse) {
    const expires_at = Date.now() + (tokenResponse.expires_in * 1000) - 60000;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      access_token: tokenResponse.access_token,
      expires_at
    }));
    localStorage.setItem(TOKEN_SCOPE_VERSION_KEY, GOOGLE_SCOPE_VERSION);
  }

  let tokenClient = null;
  function initGoogleAuth() {
    if (!GOOGLE_CLIENT_ID || !window.google || !google.accounts) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: (resp) => {
        if (resp.error) { console.error('Google auth error', resp); return; }
        storeToken(resp);
        loadCalendar(true);
        if (typeof loadPaTab === 'function') loadPaTab(true);
      }
    });
  }

  function connectGoogleCalendar() {
    if (!GOOGLE_CLIENT_ID) {
      alert('Google Calendar is not configured yet. Create an OAuth Client ID at console.cloud.google.com and add it to index.html.');
      return;
    }
    if (!tokenClient) initGoogleAuth();
    tokenClient.requestAccessToken({ prompt: getStoredToken() ? '' : 'consent' });
  }

  async function fetchCalendarEvents(accessToken, calendarId, daysBack, daysForward) {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - (daysBack || 30));
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + (daysForward || 30));
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250'
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (res.status === 401) localStorage.removeItem(TOKEN_KEY);
      throw new Error('Calendar fetch failed: ' + res.status);
    }
    const data = await res.json();
    return (data.items || []).map(ev => ({
      title: ev.summary || '(untitled)',
      start: new Date(ev.start.dateTime || ev.start.date),
      end: new Date((ev.end && (ev.end.dateTime || ev.end.date)) || ev.start.dateTime || ev.start.date),
      allDay: !ev.start.dateTime
    }));
  }

  const LESSONS_CALENDAR_NAME = 'Termly Tuition Plan';
  const LESSONS_CALENDAR_ID_KEY = 'lessons_calendar_id';

  async function findCalendarIdByName(accessToken, namePart) {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const match = (data.items || []).find(c => c.summary && c.summary.toLowerCase().includes(namePart.toLowerCase()));
    return match ? match.id : null;
  }

  // ---- Gmail (PA tab) ----
  // Same pattern as fetchCalendarEvents above: called directly from the
  // browser with the Bearer token from getStoredToken(), no server proxy.

  function base64UrlDecode(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    try { return decodeURIComponent(escape(atob(b64))); } catch (e) {
      try { return atob(b64); } catch (e2) { return ''; }
    }
  }

  function base64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function stripHtml(html) {
    let text = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  // Walks the (possibly nested multipart) payload for the best body we can
  // show — prefers plain text, falls back to stripped HTML.
  function decodeGmailBody(payload) {
    if (!payload) return '';
    let plain = null, html = null;
    function walk(part) {
      if (!part) return;
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        plain = base64UrlDecode(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
        html = base64UrlDecode(part.body.data);
      }
      (part.parts || []).forEach(walk);
    }
    walk(payload);
    if (plain) return plain.trim();
    if (html) return stripHtml(html);
    return '';
  }

  function getGmailHeader(headers, name) {
    const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  }

  function parseFromHeader(from) {
    const match = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
    const name = (match && match[1].trim()) || from;
    const email = (match && match[2].trim()) || from;
    return { name: name || email, email };
  }

  async function fetchGmailThreads(accessToken, maxResults) {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread')}&maxResults=${maxResults || 50}`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listRes.ok) {
      if (listRes.status === 401) localStorage.removeItem(TOKEN_KEY);
      throw new Error('Gmail list fetch failed: ' + listRes.status);
    }
    const listData = await listRes.json();
    const ids = (listData.messages || []).map(m => m.id);
    const messages = await Promise.all(ids.map(async id => {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) return null;
      return res.json();
    }));
    return messages.filter(Boolean).map(m => {
      const headers = m.payload && m.payload.headers;
      const from = parseFromHeader(getGmailHeader(headers, 'From'));
      return {
        id: m.id,
        threadId: m.threadId,
        subject: getGmailHeader(headers, 'Subject') || '(no subject)',
        from,
        messageIdHeader: getGmailHeader(headers, 'Message-ID'),
        date: new Date(Number(m.internalDate)),
        snippet: m.snippet || '',
        body: decodeGmailBody(m.payload),
        unread: (m.labelIds || []).includes('UNREAD')
      };
    }).sort((a, b) => b.date - a.date);
  }

  async function sendGmailReply(accessToken, { to, subject, body, threadId, inReplyTo }) {
    const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
    const headerLines = [
      `To: ${to}`,
      `Subject: ${replySubject}`,
      'Content-Type: text/plain; charset="UTF-8"'
    ];
    if (inReplyTo) {
      headerLines.push(`In-Reply-To: ${inReplyTo}`);
      headerLines.push(`References: ${inReplyTo}`);
    }
    const raw = base64UrlEncode(headerLines.join('\r\n') + '\r\n\r\n' + body);
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, threadId })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Gmail send failed: ' + res.status + ' ' + errText);
    }
    return res.json();
  }

  function daysUntil(date) {
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((b - a) / 86400000);
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function formatTime(d) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function nextSchoolDay() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function targetLessonDay(allEvents) {
    const now = new Date();
    const todaysLessons = allEvents.filter(e => sameDay(e.start, now));
    const allComplete = todaysLessons.length === 0 || todaysLessons.every(e => e.end <= now);
    return allComplete ? nextSchoolDay() : now;
  }

  function renderNextSchoolDay(allEvents) {
    const heading = document.getElementById('nextSchoolDayHeading');
    const list = document.getElementById('schoolDayList');
    const now = new Date();
    const day = targetLessonDay(allEvents);
    const isToday = sameDay(day, now);
    heading.textContent = (isToday ? 'Today — ' : 'Next School Day — ') + formatDate(day);

    const lessons = allEvents
      .filter(e => sameDay(e.start, day))
      .sort((a, b) => a.start - b.start);

    list.innerHTML = '';
    if (lessons.length === 0) {
      list.innerHTML = '<p class="placeholder-text">No lessons found.</p>';
    } else {
      lessons.forEach(e => {
        const row = document.createElement('div');
        row.className = 'event-row';
        const time = e.allDay ? 'All day' : formatTime(e.start);
        row.innerHTML = `<span class="name">${e.title}</span><span class="date">${time}</span>`;
        list.appendChild(row);
      });
    }
  }

  function renderRacingTab(fjcEvents) {
    const now = new Date();
    const upcoming = fjcEvents.filter(e => e.start >= now);
    const past = fjcEvents.filter(e => e.start < now);

    const nextRoundText = document.getElementById('nextRoundText');
    const countdownDays = document.getElementById('countdownDays');
    const countdownLabel = document.getElementById('countdownLabel');
    const nextEventsList = document.getElementById('nextEventsList');

    if (upcoming.length === 0) {
      nextRoundText.textContent = 'No upcoming FJC rounds found on the calendar.';
      countdownDays.textContent = '--';
      countdownLabel.textContent = 'Days to next round';
    } else {
      const next = upcoming[0];
      const d = daysUntil(next.start);
      countdownDays.textContent = d;
      countdownLabel.textContent = d === 1 ? 'Day to ' + next.title : 'Days to ' + next.title;
      nextRoundText.textContent = `${next.title} — ${formatDate(next.start)}`;
    }

    nextEventsList.innerHTML = '';
    if (upcoming.length === 0) {
      nextEventsList.innerHTML = '<p class="placeholder-text">No upcoming events found.</p>';
    } else {
      upcoming.slice(0, 5).forEach(e => {
        const row = document.createElement('div');
        row.className = 'event-row';
        row.innerHTML = `<span class="name">${e.title}</span><span class="date">${formatDate(e.start)}</span>`;
        nextEventsList.appendChild(row);
      });
    }

    const standaloneTestsList = document.getElementById('standaloneTestsList');
    const upcomingTests = upcoming.filter(e => e.title.toUpperCase().includes('TESTING'));
    standaloneTestsList.innerHTML = '';
    if (upcomingTests.length === 0) {
      standaloneTestsList.innerHTML = '<p class="placeholder-text">No upcoming standalone test days.</p>';
    } else {
      upcomingTests.forEach(e => {
        const row = document.createElement('div');
        row.className = 'event-row';
        row.innerHTML = `<span class="name">${e.title}</span><span class="date">${formatDate(e.start)}</span>`;
        standaloneTestsList.appendChild(row);
      });
    }

    const fullSeasonList = document.getElementById('fullSeasonList');
    const all = [...past, ...upcoming];
    fullSeasonList.innerHTML = '';
    if (all.length === 0) {
      fullSeasonList.innerHTML = '<p class="placeholder-text">No FJC events found on the calendar.</p>';
    } else {
      all.forEach(e => {
        const row = document.createElement('div');
        row.className = 'event-row' + (e.start < now ? ' faded' : '');
        row.innerHTML = `<span class="name">${e.title}</span><span class="date">${formatDate(e.start)}</span>`;
        fullSeasonList.appendChild(row);
      });
    }

    renderNextRaceCard(upcoming[0] || null);
  }

  // YYYY-MM-DD from a Date's LOCAL components. Date#toISOString() converts
  // to UTC first, which silently rolls the date back by one in any UTC+
  // timezone (e.g. the UK in BST) for anything computed near local
  // midnight — every evening, "today"/"this week's Monday" would key to
  // the wrong day.
  function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getMonday(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date;
  }

  function currentWeekKey() {
    return localDateKey(getMonday(new Date()));
  }

  function renderTrainingForRaceWeek(fjcEvents) {
    const monday = getMonday(new Date());
    const sunday = new Date(monday.getTime() + 7 * 86400000 - 1);
    const isRaceWeek = fjcEvents.some(e => e.start >= monday && e.start <= sunday);
    localStorage.setItem('is_race_week', isRaceWeek ? '1' : '0');
    updateTrainingPlan();
  }

  // Weekly targets — ticked off once each, not re-assigned per day.
  const WEEKLY_TARGETS = [
    { id: 'gym1',     label: 'Gym (strength)',                    tag: 'tag-gym',  tagLabel: 'Gym',   tier: 'hard' },
    { id: 'gym2',     label: 'Gym (strength)',                    tag: 'tag-gym',  tagLabel: 'Gym',   tier: 'hard' },
    { id: 'run5k',    label: 'Run 5k (hard effort)',               tag: 'tag-run',  tagLabel: 'Run',   tier: 'hard' },
    { id: 'run7_5k',  label: 'Run 7.5k (moderate / threshold)',    tag: 'tag-run',  tagLabel: 'Run',   tier: 'moderate' },
    { id: 'run10k',   label: 'Run 10k (easy / aerobic)',           tag: 'tag-run',  tagLabel: 'Run',   tier: 'easy' },
    { id: 'cycle40k', label: 'Cycle 40k',                          tag: 'tag-bike', tagLabel: 'Bike',  tier: 'hard' },
    { id: 'golf',     label: 'Golf / driving range',               tag: 'tag-golf', tagLabel: 'Golf',  tier: 'easy' },
    { id: 'padel',    label: 'Padel',                              tag: 'tag-padel', tagLabel: 'Padel', tier: 'moderate', bonus: true },
    { id: 'rest',     label: 'Rest day',                           tag: 'tag-rest', tagLabel: 'Rest',  tier: 'rest' }
  ];

  function getWeeklyState() {
    const key = 'weekly_targets_' + currentWeekKey();
    try { return { key, state: JSON.parse(localStorage.getItem(key) || '{}') }; } catch (e) { return { key, state: {} }; }
  }

  function setTargetComplete(id, complete) {
    const { key, state } = getWeeklyState();
    state[id] = complete;
    localStorage.setItem(key, JSON.stringify(state));
    syncPush('weeklyTargets', { weekKey: currentWeekKey(), state });
    if (typeof markWeekTaskDoneForTarget === 'function') markWeekTaskDoneForTarget(id, complete);
  }

  async function syncWeeklyTargetsFromRemote() {
    const remote = await syncPull('weeklyTargets');
    if (remote && remote.weekKey === currentWeekKey() && remote.state) {
      localStorage.setItem('weekly_targets_' + remote.weekKey, JSON.stringify(remote.state));
    }
  }

  // Tier preference order by recovery band — first incomplete match wins.
  function suggestNextTarget(recovery, state) {
    const incomplete = WEEKLY_TARGETS.filter(t => !t.bonus && !state[t.id]);
    if (incomplete.length === 0) {
      const padel = WEEKLY_TARGETS.find(t => t.bonus);
      return !state[padel.id] ? padel : null;
    }
    let order;
    if (recovery === null) order = ['hard', 'moderate', 'easy', 'rest'];
    else if (recovery >= 67) order = ['hard', 'moderate', 'easy', 'rest'];
    else if (recovery >= 34) order = ['moderate', 'easy', 'hard', 'rest'];
    else order = ['rest', 'easy', 'moderate', 'hard'];

    // Red band: only rest or golf are appropriate suggestions.
    if (recovery !== null && recovery < 34) {
      const restOrGolf = incomplete.find(t => t.id === 'rest' || t.id === 'golf');
      if (restOrGolf) return restOrGolf;
    }
    for (const tier of order) {
      const match = incomplete.find(t => t.tier === tier);
      if (match) return match;
    }
    return incomplete[0];
  }

  function renderWeeklyTargets() {
    const list = document.getElementById('weeklyTargetList');
    const banner = document.getElementById('suggestionBanner');
    if (!list) return;
    const { state } = getWeeklyState();
    const recoveryRaw = localStorage.getItem('latest_recovery_score');
    const recovery = recoveryRaw !== null ? Number(recoveryRaw) : null;
    const suggested = suggestNextTarget(recovery, state);
    const plannedToday = typeof getTodaysPlannedTask === 'function' ? getTodaysPlannedTask() : null;

    if (plannedToday) {
      banner.innerHTML = `<div class="suggestion-banner">Today: ${plannedToday.icon} ${plannedToday.label} <span class="sub">planned ${WEEK_DAY_NAMES[todayDayIndex()]}</span></div>`;
    } else if (!suggested) {
      banner.innerHTML = '<div class="suggestion-banner">All weekly targets complete — nice work.</div>';
    } else {
      const bandLabel = recovery === null ? 'No recovery data' : recovery >= 67 ? `Recovery ${recovery}% — green` : recovery >= 34 ? `Recovery ${recovery}% — yellow` : `Recovery ${recovery}% — red`;
      banner.innerHTML = `<div class="suggestion-banner">Suggested today: ${suggested.label}<span class="sub">${bandLabel}</span></div>`;
    }

    list.innerHTML = '';
    WEEKLY_TARGETS.forEach(t => {
      const completed = !!state[t.id];
      const isSuggested = suggested && suggested.id === t.id;
      const row = document.createElement('div');
      row.className = 'target-row' + (completed ? ' completed' : '') + (isSuggested && !completed ? ' suggested' : '');
      row.innerHTML = `
        <span class="checkbox-wrap"><input type="checkbox" id="target_${t.id}" ${completed ? 'checked' : ''}></span>
        <div class="desc">${t.label}${t.bonus ? '<span class="bonus-label">Bonus</span>' : ''}</div>
        <span class="tag ${t.tag}">${t.tagLabel}</span>`;
      row.querySelector('input').addEventListener('change', (e) => {
        const checking = e.target.checked;
        if (checking && !prefersReducedMotion()) {
          e.target.classList.add('tick-bounce');
          spawnTickBurst(row.querySelector('.checkbox-wrap'));
          row.querySelector('.desc').style.opacity = '0.4';
          setTimeout(() => { setTargetComplete(t.id, true); renderWeeklyTargets(); }, 300);
          return;
        }
        setTargetComplete(t.id, checking);
        renderWeeklyTargets();
      });
      list.appendChild(row);
    });

    renderWeekProgress(state);
  }

  function renderWeekProgress(state) {
    const el = document.getElementById('weekProgressContent');
    if (!el) return;
    const required = WEEKLY_TARGETS.filter(t => !t.bonus);
    const completedCount = required.filter(t => state[t.id]).length;
    const pct = Math.round((completedCount / required.length) * 100);
    const padel = WEEKLY_TARGETS.find(t => t.bonus);
    const padelDone = !!state[padel.id];
    el.innerHTML = `
      <div style="font-size:28px;font-weight:800;letter-spacing:-0.02em;">${completedCount} / ${required.length}</div>
      <div class="placeholder-text" style="margin-bottom:10px;">required targets complete</div>
      <div style="background:var(--border);border-radius:8px;height:10px;overflow:hidden;margin-bottom:10px;">
        <div style="background:var(--lime);height:100%;width:${pct}%;"></div>
      </div>
      <div class="placeholder-text">Padel (bonus): ${padelDone ? 'done' : 'not yet'}</div>`;
  }

  function updateTrainingPlan() {
    const banner = document.getElementById('raceWeekBanner');
    const planCard = document.getElementById('trainingPlanCard');
    const progressCard = document.getElementById('weekProgressCard');
    const isRaceWeek = localStorage.getItem('is_race_week') === '1';

    if (isRaceWeek) {
      banner.innerHTML = '<div class="race-week-banner">Race week — rest and prep only</div>';
      planCard.style.display = 'none';
      if (progressCard) progressCard.style.display = 'none';
      document.getElementById('suggestionBanner').innerHTML = '';
      return;
    }
    banner.innerHTML = '';
    planCard.style.display = '';
    if (progressCard) progressCard.style.display = '';
    renderWeeklyTargets();
  }

  window.addEventListener('storage', (e) => {
    if (e.key && (e.key.startsWith('weekly_targets_') || e.key === 'latest_recovery_score' || e.key === 'is_race_week')) {
      updateTrainingPlan();
    }
  });

  function reviveEventDates(cached) {
    return JSON.parse(cached).map(e => ({ ...e, start: new Date(e.start), end: e.end ? new Date(e.end) : new Date(e.start) }));
  }

  // Race calendar and lesson timetable don't change minute to minute, so
  // once today's pull has happened there's no need to keep re-fetching on
  // every reload — reuse the cache until the next calendar day, or until
  // the user explicitly reconnects.
  async function loadCalendar(force) {
    // Check the same-day cache before touching the token at all. Google's
    // access token only lasts ~1hr with no refresh token in this flow, so
    // checking the token first (as this used to) meant any reload after
    // the token expired would blank the tab even with perfectly good
    // same-day data cached — that's what looked like a "random reset".
    const cacheDate = localStorage.getItem('calendar_cache_date');
    const cachedFjcRaw = localStorage.getItem('fjc_events_cache');
    const cachedLessonsRaw = localStorage.getItem('lesson_events_cache');
    if (!force && cacheDate === todayKey() && cachedFjcRaw && cachedLessonsRaw) {
      const fjcEvents = reviveEventDates(cachedFjcRaw);
      const lessonEvents = reviveEventDates(cachedLessonsRaw);
      renderRacingTab(fjcEvents);
      renderTrainingForRaceWeek(fjcEvents);
      renderNextSchoolDay(lessonEvents);
      document.getElementById('connectCalendarBtn').textContent = getStoredToken() ? 'Reconnect Google Calendar' : 'Connect Google Calendar';
      return;
    }

    const token = getStoredToken();
    if (!token) {
      document.getElementById('connectCalendarBtn').textContent = 'Connect Google Calendar';
      return;
    }
    document.getElementById('connectCalendarBtn').textContent = 'Reconnect Google Calendar';

    try {
      const events = await fetchCalendarEvents(token.access_token, CALENDAR_ID);
      const fjcEvents = events.filter(e => {
        const t = e.title.toUpperCase();
        return t.includes('FJC') || t.includes('TESTING');
      });
      renderRacingTab(fjcEvents);
      renderTrainingForRaceWeek(fjcEvents);

      let lessonsCalendarId = localStorage.getItem(LESSONS_CALENDAR_ID_KEY);
      if (!lessonsCalendarId) {
        lessonsCalendarId = await findCalendarIdByName(token.access_token, LESSONS_CALENDAR_NAME);
        if (lessonsCalendarId) localStorage.setItem(LESSONS_CALENDAR_ID_KEY, lessonsCalendarId);
      }
      const lessonEvents = lessonsCalendarId ? await fetchCalendarEvents(token.access_token, lessonsCalendarId) : [];
      renderNextSchoolDay(lessonEvents);

      localStorage.setItem('fjc_events_cache', JSON.stringify(fjcEvents));
      localStorage.setItem('lesson_events_cache', JSON.stringify(lessonEvents));
      localStorage.setItem('calendar_cache_date', todayKey());
    } catch (err) {
      console.error(err);
      if (cachedFjcRaw) {
        const fjcEvents = reviveEventDates(cachedFjcRaw);
        renderRacingTab(fjcEvents);
        renderTrainingForRaceWeek(fjcEvents);
      }
      if (cachedLessonsRaw) {
        renderNextSchoolDay(reviveEventDates(cachedLessonsRaw));
      }
    }
  }

  document.getElementById('connectCalendarBtn').addEventListener('click', connectGoogleCalendar);

  // ---- WHOOP sync ----
  // Token exchange/refresh is proxied through a Vercel serverless function
  // (see /api/whoop-token.js) so the client secret stays server-side and
  // never reaches the browser. Set this to your deployed Vercel URL.
  const WHOOP_CLIENT_ID = '2e44105f-aa13-4d63-a679-b8397ec597c8';
  const WHOOP_REDIRECT_URI = 'https://savva-commits.github.io/dashboard/';
  const WHOOP_SCOPES = 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline';
  const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
  const WHOOP_TOKEN_PROXY_URL = 'https://dashboard20-iota.vercel.app/api/whoop-token';
  const WHOOP_DATA_PROXY_URL = 'https://dashboard20-iota.vercel.app/api/whoop-data';
  const WHOOP_TOKEN_KEY = 'whoop_token';
  const WHOOP_STATE_KEY = 'whoop_oauth_state';

  function randomState() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function connectWhoop() {
    const state = randomState();
    localStorage.setItem(WHOOP_STATE_KEY, state);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: WHOOP_CLIENT_ID,
      redirect_uri: WHOOP_REDIRECT_URI,
      scope: WHOOP_SCOPES,
      state
    });
    window.location.href = `${WHOOP_AUTH_URL}?${params}`;
  }

  function getWhoopToken() {
    try {
      const raw = localStorage.getItem(WHOOP_TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function storeWhoopToken(t) {
    localStorage.setItem(WHOOP_TOKEN_KEY, JSON.stringify({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: Date.now() + (t.expires_in * 1000) - 60000
    }));
  }

  function setWhoopDebug(msg) {
    const el = document.getElementById('whoopDebug');
    if (el) el.textContent = msg;
  }

  async function exchangeWhoopCode(code) {
    const res = await fetch(WHOOP_TOKEN_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code })
    });
    const bodyText = await res.text();
    if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${bodyText}`);
    storeWhoopToken(JSON.parse(bodyText));
  }

  // Only a 400/401 from the refresh_token grant means the refresh token
  // itself is dead — that's the one case the user actually needs to
  // re-authorize for. Anything else (network blip, 5xx) is transient and
  // should be retried silently without forcing a reconnect.
  async function refreshWhoopToken(refreshToken) {
    const res = await fetch(WHOOP_TOKEN_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    const bodyText = await res.text();
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        localStorage.removeItem(WHOOP_TOKEN_KEY);
        const err = new Error('WHOOP_SESSION_EXPIRED');
        err.code = 'WHOOP_SESSION_EXPIRED';
        throw err;
      }
      throw new Error(`Token refresh failed (${res.status}): ${bodyText}`);
    }
    storeWhoopToken(JSON.parse(bodyText));
  }

  async function whoopFetch(path) {
    let token = getWhoopToken();
    if (!token) throw new Error('not connected — click Connect WHOOP first');
    if (Date.now() >= token.expires_at) {
      await refreshWhoopToken(token.refresh_token);
      token = getWhoopToken();
    }
    const proxyUrl = `${WHOOP_DATA_PROXY_URL}?path=${encodeURIComponent(path)}`;
    let res = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (res.status === 401) {
      await refreshWhoopToken(token.refresh_token);
      token = getWhoopToken();
      res = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${token.access_token}` } });
    }
    const bodyText = await res.text();
    if (!res.ok) throw new Error(`WHOOP API error for ${path} (${res.status}): ${bodyText}`);
    return JSON.parse(bodyText);
  }

  function recoveryColor(score) {
    if (score >= 67) return getCssVar('--rec-green') || '#1D9E75';
    if (score >= 34) return getCssVar('--rec-amber') || '#D4920A';
    return getCssVar('--rec-red') || '#D94040';
  }

  // Draws the 14-day trend as a line with point markers. On first render it
  // draws itself left-to-right over 800ms, then pops each point in one by
  // one — skipped entirely under prefers-reduced-motion, which jumps
  // straight to the fully-drawn state.
  // Guards against overlapping animation runs — applyWhoopDataToUI can be
  // called more than once during load (cache check, then a fresh fetch),
  // and without this an older still-running rAF loop would race the newer
  // one and leave points part-way drawn.
  let trendChartAnimToken = 0;

  function drawTrendChart(scores) {
    const myToken = ++trendChartAnimToken;
    const canvas = document.getElementById('trendChart');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!scores.length) return;

    const padTop = 22, padBottom = 6, padX = 10;
    const plotW = w - padX * 2;
    const plotH = h - padTop - padBottom;
    const stepX = scores.length > 1 ? plotW / (scores.length - 1) : 0;
    const points = scores.map((s, i) => ({
      x: padX + i * stepX,
      y: padTop + plotH - (s / 100) * plotH,
      s
    }));
    const lineColor = getCssVar('--lime') || '#84cc16';
    const textColor = getCssVar('--ink') || '#15201a';

    function drawLine(clipFraction) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, padX + plotW * clipFraction, h);
      ctx.clip();
      ctx.beginPath();
      points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    function drawPoint(p, radius) {
      if (radius <= 0) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = recoveryColor(p.s);
      ctx.fill();
      if (radius >= 3) {
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = textColor;
        ctx.fillText(p.s + '%', p.x, Math.max(10, p.y - 8));
      }
    }

    function settle() {
      ctx.clearRect(0, 0, w, h);
      drawLine(1);
      points.forEach(p => drawPoint(p, 3.5));
    }

    if (prefersReducedMotion()) { settle(); return; }

    const lineDuration = 800;
    const lineStart = performance.now();
    function lineTick(now) {
      if (myToken !== trendChartAnimToken) return;
      const t = Math.min((now - lineStart) / lineDuration, 1);
      ctx.clearRect(0, 0, w, h);
      drawLine(t);
      if (t < 1) requestAnimationFrame(lineTick);
      else popInPoints(0);
    }
    function popInPoints(idx) {
      if (myToken !== trendChartAnimToken) return;
      if (idx >= points.length) return;
      const popDuration = 150;
      const popStart = performance.now();
      function popTick(now) {
        if (myToken !== trendChartAnimToken) return;
        const t = Math.min((now - popStart) / popDuration, 1);
        ctx.clearRect(0, 0, w, h);
        drawLine(1);
        points.forEach((p, i) => {
          if (i < idx) drawPoint(p, 3.5);
          else if (i === idx) drawPoint(p, 3.5 * t);
        });
        if (t < 1) requestAnimationFrame(popTick);
        else popInPoints(idx + 1);
      }
      requestAnimationFrame(popTick);
    }
    requestAnimationFrame(lineTick);
  }

  function todayKey() {
    return localDateKey(new Date());
  }

  const WHOOP_DATA_CACHE_KEY = 'whoop_data_cache';

  function getWhoopDataCache() {
    try { return JSON.parse(localStorage.getItem(WHOOP_DATA_CACHE_KEY) || 'null'); } catch (e) { return null; }
  }

  function applyWhoopDataToUI(d) {
    if (d.score !== null && d.score !== undefined) {
      const ringCircle = document.getElementById('ringProgressCircle');
      const circumference = 2 * Math.PI * 84;
      const color = recoveryColor(d.score);
      const offset = circumference * (1 - d.score / 100);
      document.getElementById('recoveryRing').style.setProperty('--ring-color', color);
      ringCircle.style.stroke = color;
      if (prefersReducedMotion()) {
        ringCircle.style.strokeDashoffset = offset;
      } else {
        // Reset to fully-empty and commit that frame before animating to
        // the target offset, so the CSS transition actually has something
        // to animate between (otherwise both writes land in one frame).
        ringCircle.style.strokeDashoffset = circumference;
        requestAnimationFrame(() => { ringCircle.style.strokeDashoffset = offset; });
      }
      animateCountUp(document.getElementById('recoveryNum'), d.score, 900);
      document.getElementById('recoveryLabel').textContent =
        d.score >= 67 ? 'Green day — push hard' : d.score >= 34 ? 'Yellow — stay moderate' : 'Red — rest up';
    }
    if (d.hrv !== null) animateCountUp(document.getElementById('hrvValue'), d.hrv, 700);
    if (d.rhr !== null) animateCountUp(document.getElementById('rhrValue'), d.rhr, 700);
    if (d.sleepPerf !== null) animateCountUp(document.getElementById('sleepPerfValue'), d.sleepPerf, 700);
    if (d.sleepHours !== null) animateCountUp(document.getElementById('sleepHoursValue'), d.sleepHours, 700, { decimals: 1 });
    drawTrendChart(d.trendScores || []);
    document.getElementById('trendPlaceholder').style.display = (d.trendScores || []).length ? 'none' : '';
    if (d.score !== null && d.score !== undefined) localStorage.setItem('latest_recovery_score', String(d.score));
    document.getElementById('connectWhoopBtn').textContent = 'Reconnect WHOOP';
    updateTrainingPlan();
    renderTodaySnapshot();
  }

  function renderTodaySnapshot() {
    const el = document.getElementById('todaySnapshotContent');
    if (!el) return;
    const recovery = localStorage.getItem('latest_recovery_score');
    const hrv = document.getElementById('hrvValue') ? document.getElementById('hrvValue').textContent.trim() + ' ms' : '--';
    const rhr = document.getElementById('rhrValue') ? document.getElementById('rhrValue').textContent.trim() + ' bpm' : '--';
    const sleepPerf = document.getElementById('sleepPerfValue') ? document.getElementById('sleepPerfValue').textContent.trim() + '%' : '--';
    const sleepHours = document.getElementById('sleepHoursValue') ? document.getElementById('sleepHoursValue').textContent.trim() + 'h' : '--';
    el.innerHTML = `
      <div class="event-row"><span class="name">Recovery</span><span class="date">${recovery !== null ? recovery + '%' : '--'}</span></div>
      <div class="event-row"><span class="name">HRV</span><span class="date">${hrv}</span></div>
      <div class="event-row"><span class="name">RHR</span><span class="date">${rhr}</span></div>
      <div class="event-row"><span class="name">Sleep Perf</span><span class="date">${sleepPerf}</span></div>
      <div class="event-row"><span class="name">Sleep</span><span class="date">${sleepHours}</span></div>`;
    if (typeof renderHomeUpcomingSession === 'function') renderHomeUpcomingSession();
  }

  function renderNextRaceCard(nextEvent) {
    const el = document.getElementById('nextRaceCardContent');
    if (!el) return;
    if (!nextEvent) {
      el.innerHTML = '<p class="placeholder-text">No upcoming FJC round on the calendar.</p>';
      return;
    }
    const d = daysUntil(nextEvent.start);
    el.innerHTML = `
      <div class="countdown" style="padding:4px 0;">
        <div class="days">${d}</div>
        <div class="label">${d === 1 ? 'Day to' : 'Days to'} ${nextEvent.title}</div>
      </div>
      <p class="placeholder-text" style="text-align:center;">${formatDate(nextEvent.start)}</p>`;
  }

  // WHOOP recovery/sleep are computed once per day and don't change again
  // until the next sleep cycle, so once today's data is cached there's no
  // need to keep hitting the API on every reload — just reuse the cache.
  async function loadWhoopData(force) {
    const cache = getWhoopDataCache();
    if (!force && cache && cache.date === todayKey()) {
      applyWhoopDataToUI(cache);
      setWhoopDebug('');
      return;
    }
    try {
      const recoveryData = await whoopFetch('/v2/recovery?limit=14');
      const sleepData = await whoopFetch('/v2/activity/sleep?limit=1');

      const records = (recoveryData.records || []).slice().reverse();
      const latest = records[records.length - 1];

      const data = { date: todayKey(), score: null, hrv: null, rhr: null, sleepPerf: null, sleepHours: null, trendScores: [] };

      if (latest && latest.score) {
        data.score = Math.round(latest.score.recovery_score);
        data.hrv = Math.round(latest.score.hrv_rmssd_milli);
        data.rhr = Math.round(latest.score.resting_heart_rate);
      }
      data.trendScores = records.filter(r => r.score).map(r => Math.round(r.score.recovery_score));

      const sleepRecord = (sleepData.records || [])[0];
      if (sleepRecord && sleepRecord.score) {
        data.sleepPerf = Math.round(sleepRecord.score.sleep_performance_percentage);
        const stages = sleepRecord.score.stage_summary || {};
        const totalMs = (stages.total_light_sleep_time_milli || 0) + (stages.total_slow_wave_sleep_time_milli || 0) + (stages.total_rem_sleep_time_milli || 0);
        data.sleepHours = (totalMs / 3600000).toFixed(1);
      }

      localStorage.setItem(WHOOP_DATA_CACHE_KEY, JSON.stringify(data));
      applyWhoopDataToUI(data);
      setWhoopDebug('');
    } catch (err) {
      console.error(err);
      if (err.code === 'WHOOP_SESSION_EXPIRED') {
        document.getElementById('connectWhoopBtn').textContent = 'Connect WHOOP';
        setWhoopDebug('WHOOP session expired — tap Connect WHOOP to log in again.');
        return;
      }
      // Transient errors (network blip, momentary 5xx) are logged but not
      // surfaced — fall back to whatever's cached, even if from an earlier
      // day, so the screen never just goes blank.
      if (cache) applyWhoopDataToUI(cache);
    }
  }

  document.getElementById('connectWhoopBtn').addEventListener('click', connectWhoop);

  // Only matters before today's data has been fetched at all (e.g. WHOOP
  // posts the recovery score a bit after the app is first opened) — once
  // cached for today, loadWhoopData() below is a no-op against the network.
  setInterval(() => {
    if (getWhoopToken()) loadWhoopData();
  }, 5 * 60 * 1000);

  // OAuth codes are single-use — some mobile browsers fire the page load
  // handler more than once on the redirect-back page, which would otherwise
  // try to exchange the same code twice and fail the second time.
  let whoopRedirectHandled = false;

  async function handleWhoopRedirect() {
    if (whoopRedirectHandled) return false;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error');
    // Normalize to the exact registered redirect path. Some mobile browsers
    // (in particular when the OAuth redirect lands back outside an
    // installed-PWA context) can hand back a URL whose path differs subtly
    // (missing/extra trailing slash) — pin it so the app and any future
    // reload always agree on where they are.
    if (errorParam) {
      history.replaceState({}, '', '/dashboard/');
      setWhoopDebug('WHOOP authorization error: ' + errorParam);
      return false;
    }
    if (!code) return false;
    const savedState = localStorage.getItem(WHOOP_STATE_KEY);
    history.replaceState({}, '', '/dashboard/');
    // On some mobile browsers the OAuth redirect lands in a storage context
    // that can't read back the state value saved before the redirect (e.g.
    // a standalone home-screen PWA handing the redirect to the system
    // browser). Treat a missing saved state as a warning, not a hard stop —
    // the auth code itself is short-lived and single-use, so this is a low
    // CSRF risk for a single-user personal app. A real mismatch (state
    // present but wrong) still blocks, since that *is* a forged redirect.
    if (state && savedState && state !== savedState) {
      setWhoopDebug('WHOOP state mismatch — try connecting again');
      return false;
    }
    localStorage.removeItem(WHOOP_STATE_KEY);
    whoopRedirectHandled = true;
    await exchangeWhoopCode(code);
    return true;
  }

  window.addEventListener('load', () => {
    setTimeout(async () => {
      initGoogleAuth();
      if (getStoredToken()) loadCalendar();

      const justConnected = await handleWhoopRedirect().catch(err => {
        console.error(err);
        setWhoopDebug(err.message);
        return false;
      });
      if (justConnected || getWhoopToken()) loadWhoopData(justConnected);
      if (justConnected) {
        loadCalorieTarget(true).then(() => renderNutritionTab());
      }
    }, 300);
  });

  // ---- Daily Briefing (Anthropic API) ----
  const ANTHROPIC_KEY_STORAGE = 'anthropic_api_key';

  function getAnthropicKey() {
    return localStorage.getItem(ANTHROPIC_KEY_STORAGE) || '';
  }

  document.getElementById('saveAnthropicKeyBtn').addEventListener('click', () => {
    const val = document.getElementById('anthropicKeyInput').value.trim();
    if (!val) return;
    localStorage.setItem(ANTHROPIC_KEY_STORAGE, val);
    document.getElementById('anthropicKeyInput').value = '';
    document.getElementById('anthropicKeyInput').placeholder = 'Key saved ✓ — sk-ant-...';
  });

  // ---- Claude helper (PA tab) ----
  // Same direct-browser-call pattern as sendChatMessage() above — no server
  // proxy, key never leaves this device except in the request to Anthropic.
  async function callClaude(system, messages, maxTokens) {
    const key = getAnthropicKey();
    if (!key) throw new Error('missing_anthropic_key');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens || 800,
        system,
        messages
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Anthropic API error: ' + res.status + ' ' + errText);
    }
    const data = await res.json();
    return (data.content || []).map(c => c.text || '').join('\n');
  }

  // Extracts the first {...} or [...] block from a Claude response, so a
  // reply like "Here you go:\n[...]" still parses even though we asked for
  // JSON only.
  function extractJson(text) {
    const match = text.match(/[\[{][\s\S]*[\]}]/);
    if (!match) throw new Error('no_json_in_response');
    return JSON.parse(match[0]);
  }

  async function triageEmailsWithClaude(emails) {
    const list = emails.map(e => ({ id: e.id, from: e.from.name + ' <' + e.from.email + '>', subject: e.subject, snippet: e.snippet }));
    const system = 'You are a personal assistant for Savva, a racing driver. Review these email subjects and senders and return only the ones that are relevant to him. Relevant means: racing, motorsport, logistics (travel, hotels, schedules), people he works with (teams, managers, organisers, sponsors), or anything that requires a response. Return a JSON array of the relevant email IDs only, with a one-line summary and a relevance_score 1-10 for each. Respond with ONLY the JSON array, no other text. Each item: {"id": "...", "summary": "...", "relevance_score": 1-10, "category": "racing"|"logistics"|"meeting"|"other", "needs_reply": true|false}';
    const text = await callClaude(system, [{ role: 'user', content: JSON.stringify(list) }], 2000);
    return extractJson(text);
  }

  async function draftReplyWithClaude(email) {
    const system = 'You are a personal assistant helping Savva, a racing driver, manage his communications. Write replies that are professional, direct, and natural — not overly formal. Savva is focused on the 2026 FJC season and targeting GT4 in 2027.';
    const emailText = `From: ${email.from.name} <${email.from.email}>\nSubject: ${email.subject}\n\n${email.body}`;
    return callClaude(system, [{ role: 'user', content: `Draft a reply to this email:\n\n${emailText}` }], 600);
  }

  async function refineDraftWithClaude(email, currentDraft, chatHistory, userMessage) {
    const emailText = `From: ${email.from.name} <${email.from.email}>\nSubject: ${email.subject}\n\n${email.body}`;
    const system = `You are helping Savva refine a draft email reply. Here is the original email:\n\n${emailText}\n\nHere is the current draft reply:\n\n${currentDraft}\n\nThe user will give refinement instructions. Respond with ONLY the full updated draft text — no preamble, no explanation, no quotes around it.`;
    const messages = chatHistory.map(m => ({ role: m.role, content: m.content })).concat([{ role: 'user', content: userMessage }]);
    return callClaude(system, messages, 600);
  }

  function gatherBriefingContext() {
    const recovery = localStorage.getItem('latest_recovery_score');
    const hrv = document.getElementById('hrvValue').textContent.trim() + ' ms';
    const rhr = document.getElementById('rhrValue').textContent.trim() + ' bpm';
    const sleepPerf = document.getElementById('sleepPerfValue').textContent.trim() + '%';
    const sleepHours = document.getElementById('sleepHoursValue').textContent.trim() + 'h';
    const isRaceWeek = localStorage.getItem('is_race_week') === '1';

    let nextRace = 'No upcoming FJC round on the calendar';
    try {
      const fjc = JSON.parse(localStorage.getItem('fjc_events_cache') || '[]').map(e => ({ ...e, start: new Date(e.start) }));
      const now = new Date();
      const upcoming = fjc.filter(e => e.start >= now).sort((a, b) => a.start - b.start);
      if (upcoming.length) nextRace = `${upcoming[0].title} on ${formatDate(upcoming[0].start)} (${daysUntil(upcoming[0].start)} days away)`;
    } catch (e) {}

    const plannedToday = typeof getTodaysPlannedTask === 'function' ? getTodaysPlannedTask() : null;
    const todayPlan = plannedToday ? `${plannedToday.icon} ${plannedToday.label}${plannedToday.done ? ' (already logged)' : ''}` : 'Nothing planned in the Week tab';

    let todaysEvents = 'No calendar events today';
    try {
      const all = JSON.parse(localStorage.getItem('pa_all_events_cache') || '[]').map(e => ({ ...e, start: new Date(e.start) }));
      const tKey = todayKey();
      const today = all.filter(e => localDateKey(e.start) === tKey).sort((a, b) => a.start - b.start);
      if (today.length) todaysEvents = today.map(e => `${e.allDay ? 'All day' : formatTime(e.start)} — ${e.title}`).join('; ');
    } catch (e) {}

    let emailsAwaitingReply = 'None';
    try {
      const emails = JSON.parse(localStorage.getItem('pa_emails_cache') || '[]');
      const needsReply = emails.filter(e => e.needs_reply);
      if (needsReply.length) emailsAwaitingReply = needsReply.map(e => `${e.from.name}: ${e.subject}`).join('; ');
    } catch (e) {}

    return { recovery, hrv, rhr, sleepPerf, sleepHours, isRaceWeek, nextRace, todayPlan, todaysEvents, emailsAwaitingReply };
  }

  function buildSystemPrompt() {
    const ctx = gatherBriefingContext();
    return `You are a briefing assistant focused entirely on the live data below — not on long-term goals or who the user is. Use the data to ground your responses. The user may tell you how they're feeling; factor that in alongside the data rather than just restating it.

Live data:
- Recovery score: ${ctx.recovery !== null ? ctx.recovery + '%' : 'not connected'}
- HRV: ${ctx.hrv}
- RHR: ${ctx.rhr}
- Sleep performance: ${ctx.sleepPerf}
- Sleep duration: ${ctx.sleepHours}
- Race week: ${ctx.isRaceWeek ? 'yes' : 'no'}
- Next FJC round: ${ctx.nextRace}
- Today's planned session: ${ctx.todayPlan}
- Today's calendar: ${ctx.todaysEvents}
- Emails awaiting reply: ${ctx.emailsAwaitingReply}

Keep replies short, direct, and action-first. No preamble, no sign-off.`;
  }

  const CHAT_HISTORY_KEY = 'briefing_chat_history';

  function getChatHistory() {
    try { return JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }

  function saveChatHistory(history) {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  }

  function renderChat() {
    const container = document.getElementById('chatMessages');
    const history = getChatHistory();
    container.innerHTML = '';
    if (history.length === 0) {
      container.innerHTML = '<p class="placeholder-text">Tell me how you\'re feeling, or ask about today\'s data.</p>';
      return;
    }
    history.forEach(m => {
      const row = document.createElement('div');
      const isUser = m.role === 'user';
      row.style.alignSelf = isUser ? 'flex-end' : 'flex-start';
      row.style.maxWidth = '80%';
      row.style.padding = '10px 14px';
      row.style.borderRadius = '14px';
      row.style.fontSize = '15px';
      row.style.lineHeight = '1.4';
      row.style.background = isUser ? 'var(--lime)' : 'var(--border)';
      row.style.color = isUser ? '#15201a' : 'var(--ink)';
      row.textContent = m.content;
      container.appendChild(row);
    });
    container.scrollTop = container.scrollHeight;
    renderBriefingPreview();
  }

  function renderBriefingPreview() {
    const el = document.getElementById('briefingPreview');
    if (!el) return;
    const plannedToday = typeof getTodaysPlannedTask === 'function' ? getTodaysPlannedTask() : null;
    const planLine = plannedToday ? `<p class="placeholder-text" style="color:var(--ink);font-weight:700;margin-bottom:6px;">Today: ${plannedToday.icon} ${plannedToday.label}</p>` : '';
    const needsReplyCount = Number(localStorage.getItem(PA_NEEDS_REPLY_COUNT_KEY) || 0);
    const badgeLine = needsReplyCount > 0
      ? `<p class="placeholder-text" style="margin-bottom:6px;"><span class="pa-needs-reply-badge">${needsReplyCount} email${needsReplyCount === 1 ? '' : 's'} need${needsReplyCount === 1 ? 's' : ''} a reply</span></p>`
      : '';
    const history = getChatHistory();
    const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) {
      el.innerHTML = planLine + badgeLine + '<p class="placeholder-text">No briefing yet — open the Briefing tab to chat.</p>';
      return;
    }
    const preview = lastAssistant.content.length > 220 ? lastAssistant.content.slice(0, 220) + '…' : lastAssistant.content;
    el.innerHTML = planLine + badgeLine + `<p class="placeholder-text" style="color:var(--ink);">${preview}</p>`;
  }

  document.getElementById('openBriefingFromHomeBtn').addEventListener('click', () => {
    document.querySelector('nav.tabbar button[data-tab="briefing"]').click();
  });

  async function sendChatMessage() {
    const key = getAnthropicKey();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    if (!key) {
      alert('Save your Anthropic API key above first.');
      return;
    }
    const history = getChatHistory();
    history.push({ role: 'user', content: text });
    saveChatHistory(history);
    input.value = '';
    renderChat();

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          system: buildSystemPrompt(),
          messages: history.map(m => ({ role: m.role, content: m.content }))
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Anthropic API error: ' + res.status + ' ' + errText);
      }
      const data = await res.json();
      const replyText = (data.content || []).map(c => c.text || '').join('\n');
      history.push({ role: 'assistant', content: replyText });
      saveChatHistory(history);
      renderChat();
    } catch (err) {
      console.error(err);
      history.push({ role: 'assistant', content: 'Something went wrong reaching the API — check your key and try again.' });
      saveChatHistory(history);
      renderChat();
    }
  }

  document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  document.getElementById('chatResetBtn').addEventListener('click', () => {
    saveChatHistory([]);
    renderChat();
  });

  renderChat();

  // ---- Nutrition ----
  const PROTEIN_TARGET = 140;
  const KJ_PER_KCAL = 4.184;

  function foodLogKey(dateKey) {
    return 'food_log_' + dateKey;
  }

  function getFoodLog(dateKey) {
    try { return JSON.parse(localStorage.getItem(foodLogKey(dateKey)) || '[]'); } catch (e) { return []; }
  }

  function getDailyTotalsMap() {
    try { return JSON.parse(localStorage.getItem('daily_totals') || '{}'); } catch (e) { return {}; }
  }

  function saveFoodLog(log) {
    const dateKey = todayKey();
    localStorage.setItem(foodLogKey(dateKey), JSON.stringify(log));
    const totals = log.reduce((acc, f) => ({
      calories: acc.calories + Number(f.calories || 0),
      protein: acc.protein + Number(f.protein || 0)
    }), { calories: 0, protein: 0 });
    const allTotals = getDailyTotalsMap();
    allTotals[dateKey] = totals;
    localStorage.setItem('daily_totals', JSON.stringify(allTotals));
    return totals;
  }

  // ---- Cross-device sync (private GitHub repo backend) ----
  const FOOD_LOG_PROXY_URL = 'https://dashboard20-iota.vercel.app/api/food-log';
  const SYNC_PROXY_URL = 'https://dashboard20-iota.vercel.app/api/sync';

  async function syncPull(key) {
    try {
      const res = await fetch(`${SYNC_PROXY_URL}?key=${key}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      return data.value;
    } catch (err) {
      console.error('sync pull failed', key, err);
      return undefined;
    }
  }

  async function syncPush(key, value) {
    try {
      await fetch(SYNC_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
    } catch (err) {
      console.error('sync push failed', key, err);
    }
  }

  async function pushFoodLogRemote(log) {
    try {
      await fetch(FOOD_LOG_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayKey(), log })
      });
    } catch (err) {
      console.error('food log remote push failed', err);
    }
  }

  async function pullFoodLogRemote() {
    try {
      const res = await fetch(`${FOOD_LOG_PROXY_URL}?date=${todayKey()}`);
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.log) ? data.log : null;
    } catch (err) {
      console.error('food log remote pull failed', err);
      return null;
    }
  }

  // Pulls today's log from the shared store so changes made on another
  // device show up here too. Server is treated as source of truth on pull;
  // local writes always push immediately after so the next device to pull
  // sees them.
  async function syncFoodLogFromRemote() {
    const remoteLog = await pullFoodLogRemote();
    if (remoteLog) saveFoodLog(remoteLog);
    await renderNutritionTab();
  }

  function getCalorieTargetCache() {
    try { return JSON.parse(localStorage.getItem('calorie_target_cache_v2') || 'null'); } catch (e) { return null; }
  }

  // Yesterday's TDEE (from WHOOP's completed cycle energy expenditure)
  // minus 150, cached per day just like the other WHOOP-derived values.
  // Average TDEE across the last 7 completed WHOOP cycles, minus 150 —
  // smoother than a single day, which can swing a lot cycle to cycle.
  async function loadCalorieTarget(force) {
    const cache = getCalorieTargetCache();
    if (!force && cache && cache.date === todayKey()) return cache.target;
    if (!getWhoopToken()) return cache ? cache.target : null;
    try {
      const cycleData = await whoopFetch('/v2/cycle?limit=10');
      const records = (cycleData.records || [])
        .filter(r => r.end && r.score && r.score.kilojoule)
        .sort((a, b) => new Date(b.start) - new Date(a.start))
        .slice(0, 7);
      if (records.length === 0) return cache ? cache.target : null;
      const avgKj = records.reduce((sum, r) => sum + r.score.kilojoule, 0) / records.length;
      const tdee = avgKj / KJ_PER_KCAL;
      const target = Math.round(tdee - 150);
      localStorage.setItem('calorie_target_cache_v2', JSON.stringify({ date: todayKey(), target }));
      return target;
    } catch (err) {
      console.error(err);
      return cache ? cache.target : null;
    }
  }

  function ringColorFor(pct) {
    if (pct >= 100) return '#16a34a';
    if (pct >= 60) return '#eab308';
    return '#ef4444';
  }

  function renderNutritionRings(target, consumedCalories, consumedProtein) {
    const container = document.getElementById('nutritionRings');
    if (!container) return;

    const calPct = target ? Math.min(100, Math.round((consumedCalories / target) * 100)) : 0;
    const proteinPct = Math.min(100, Math.round((consumedProtein / PROTEIN_TARGET) * 100));
    const remaining = target !== null ? target - consumedCalories : null;

    let remainingColor = '#16a34a';
    if (remaining !== null) {
      if (remaining < 0) remainingColor = '#ef4444';
      else if (remaining < 300) remainingColor = '#eab308';
    }
    const remainingPct = target ? Math.max(0, Math.min(100, Math.round((Math.max(0, remaining) / target) * 100))) : 0;

    container.innerHTML = `
      <div class="mini-ring-wrap">
        <div class="mini-ring" style="--pct:${calPct};--ring-color:#0d9488;">
          <span class="val">${consumedCalories}</span>
        </div>
        <div class="mini-ring-label">Calories</div>
        <div class="mini-ring-sub">of ${target !== null ? target : '--'}</div>
      </div>
      <div class="mini-ring-wrap">
        <div class="mini-ring" style="--pct:${proteinPct};--ring-color:#84cc16;">
          <span class="val">${consumedProtein}g</span>
        </div>
        <div class="mini-ring-label">Protein</div>
        <div class="mini-ring-sub">of ${PROTEIN_TARGET}g</div>
      </div>
      <div class="mini-ring-wrap">
        <div class="mini-ring" style="--pct:${remainingPct};--ring-color:${remainingColor};">
          <span class="val">${remaining !== null ? remaining : '--'}</span>
        </div>
        <div class="mini-ring-label">Remaining</div>
        <div class="mini-ring-sub">${target !== null ? '' : 'connect WHOOP'}</div>
      </div>`;
  }

  function renderFoodLog(log, newEntryId) {
    const list = document.getElementById('foodLogList');
    list.innerHTML = '';
    if (log.length === 0) {
      list.innerHTML = '<p class="placeholder-text">No food logged today.</p>';
      return;
    }
    log.forEach(f => {
      const row = document.createElement('div');
      row.className = 'food-row' + (f.id === newEntryId ? ' slide-in' : '');
      row.innerHTML = `
        <div class="name">${f.name}</div>
        <div class="macro">${f.calories} kcal · ${f.protein}g protein</div>
        <button class="delete-btn" data-id="${f.id}">&times;</button>`;
      row.querySelector('.delete-btn').addEventListener('click', () => deleteFoodEntry(f.id, row));
      list.appendChild(row);
    });
  }

  async function renderNutritionTab(newEntryId) {
    const log = getFoodLog(todayKey());
    const totals = saveFoodLog(log); // recomputes daily_totals without changing the log itself
    const target = await loadCalorieTarget(false);
    renderNutritionRings(target, totals.calories, totals.protein);
    renderFoodLog(log, newEntryId);
  }

  function deleteFoodEntry(id, rowEl) {
    const commit = () => {
      const log = getFoodLog(todayKey()).filter(f => f.id !== id);
      saveFoodLog(log);
      pushFoodLogRemote(log);
      renderNutritionTab();
    };
    if (rowEl && !prefersReducedMotion()) {
      rowEl.classList.add('slide-out');
      setTimeout(commit, 200);
    } else {
      commit();
    }
  }

  function addFoodEntry(name, calories, protein) {
    const log = getFoodLog(todayKey());
    const entry = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name, calories: Math.round(calories), protein: Math.round(protein) };
    log.push(entry);
    saveFoodLog(log);
    pushFoodLogRemote(log);
    renderNutritionTab(entry.id);
  }

  async function estimateMacrosFromText(promptText) {
    const key = getAnthropicKey();
    if (!key) {
      alert('Save your Anthropic API key on the Briefing tab first.');
      return null;
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: promptText }]
      })
    });
    if (!res.ok) throw new Error('Anthropic API error: ' + res.status);
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    const match = text.match(/\{[^}]*\}/);
    if (!match) throw new Error('Could not parse estimate');
    const parsed = JSON.parse(match[0]);
    return { calories: Number(parsed.calories) || 0, protein: Number(parsed.protein) || 0 };
  }

  function estimateFoodMacros(name) {
    return estimateMacrosFromText(`Estimate calories and protein (grams) for a typical serving of: "${name}". Respond with ONLY a JSON object like {"calories": 250, "protein": 12} — no other text.`);
  }

  function estimateRecipeMacros(description) {
    return estimateMacrosFromText(`Estimate total calories and protein (grams) for this meal: "${description}". Respond with ONLY a JSON object like {"calories": 250, "protein": 12} — no other text.`);
  }

  document.getElementById('addFoodBtn').addEventListener('click', () => {
    document.getElementById('addFoodForm').style.display = '';
    document.getElementById('addFoodBtn').style.display = 'none';
  });

  document.getElementById('cancelFoodBtn').addEventListener('click', () => {
    document.getElementById('addFoodForm').style.display = 'none';
    document.getElementById('addFoodBtn').style.display = '';
    document.getElementById('foodNameInput').value = '';
    document.getElementById('foodCaloriesInput').value = '';
    document.getElementById('foodProteinInput').value = '';
  });

  document.getElementById('estimateFoodBtn').addEventListener('click', async () => {
    const name = document.getElementById('foodNameInput').value.trim();
    if (!name) { alert('Type a food name first.'); return; }
    const btn = document.getElementById('estimateFoodBtn');
    btn.textContent = 'Estimating...';
    try {
      const estimate = await estimateFoodMacros(name);
      if (estimate) {
        document.getElementById('foodCaloriesInput').value = estimate.calories;
        document.getElementById('foodProteinInput').value = estimate.protein;
      }
    } catch (err) {
      console.error(err);
      alert('Could not get an estimate — enter the numbers manually instead.');
    }
    btn.textContent = 'Estimate with AI';
  });

  document.getElementById('saveFoodBtn').addEventListener('click', () => {
    const name = document.getElementById('foodNameInput').value.trim();
    const calories = Number(document.getElementById('foodCaloriesInput').value);
    const protein = Number(document.getElementById('foodProteinInput').value);
    if (!name || !calories) { alert('Enter a food name and calories.'); return; }
    addFoodEntry(name, calories, protein || 0);
    document.getElementById('cancelFoodBtn').click();
  });

  // ---- Recipe Library ----
  function getSavedRecipes() {
    try { return JSON.parse(localStorage.getItem('saved_recipes') || '[]'); } catch (e) { return []; }
  }

  function saveSavedRecipes(recipes) {
    localStorage.setItem('saved_recipes', JSON.stringify(recipes));
    syncPush('savedRecipes', recipes);
  }

  async function syncSavedRecipesFromRemote() {
    const remote = await syncPull('savedRecipes');
    if (Array.isArray(remote)) localStorage.setItem('saved_recipes', JSON.stringify(remote));
  }

  let editingRecipeId = null;

  function renderRecipeList() {
    const list = document.getElementById('recipeList');
    const recipes = getSavedRecipes();
    list.innerHTML = '';
    if (recipes.length === 0) {
      list.innerHTML = '<p class="placeholder-text">No saved recipes yet.</p>';
      return;
    }
    recipes.forEach(r => {
      const row = document.createElement('div');
      row.className = 'recipe-row';
      row.innerHTML = `
        <div class="recipe-main">
          <div class="name">${r.name}</div>
          <div class="macro">${r.calories} kcal · ${r.protein}g protein</div>
        </div>
        <button class="icon-btn edit" title="Edit">✎</button>
        <button class="icon-btn delete" title="Delete">&times;</button>`;
      row.querySelector('.recipe-main').addEventListener('click', () => {
        addFoodEntry(r.name, r.calories, r.protein);
      });
      row.querySelector('.edit').addEventListener('click', (e) => {
        e.stopPropagation();
        editingRecipeId = r.id;
        document.getElementById('recipeDescInput').value = '';
        document.getElementById('recipeNameInput').value = r.name;
        document.getElementById('recipeCaloriesInput').value = r.calories;
        document.getElementById('recipeProteinInput').value = r.protein;
        document.getElementById('addRecipeForm').style.display = '';
        document.getElementById('addRecipeBtn').style.display = 'none';
      });
      row.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        saveSavedRecipes(getSavedRecipes().filter(x => x.id !== r.id));
        renderRecipeList();
      });
      list.appendChild(row);
    });
  }

  function resetRecipeForm() {
    editingRecipeId = null;
    document.getElementById('addRecipeForm').style.display = 'none';
    document.getElementById('addRecipeBtn').style.display = '';
    document.getElementById('recipeDescInput').value = '';
    document.getElementById('recipeNameInput').value = '';
    document.getElementById('recipeCaloriesInput').value = '';
    document.getElementById('recipeProteinInput').value = '';
  }

  document.getElementById('addRecipeBtn').addEventListener('click', () => {
    document.getElementById('addRecipeForm').style.display = '';
    document.getElementById('addRecipeBtn').style.display = 'none';
  });

  document.getElementById('cancelRecipeBtn').addEventListener('click', resetRecipeForm);

  document.getElementById('estimateRecipeBtn').addEventListener('click', async () => {
    const desc = document.getElementById('recipeDescInput').value.trim();
    if (!desc) { alert('Describe the meal first.'); return; }
    const btn = document.getElementById('estimateRecipeBtn');
    btn.textContent = 'Estimating...';
    try {
      const estimate = await estimateRecipeMacros(desc);
      if (estimate) {
        document.getElementById('recipeCaloriesInput').value = estimate.calories;
        document.getElementById('recipeProteinInput').value = estimate.protein;
      }
    } catch (err) {
      console.error(err);
      alert('Could not get an estimate — enter the numbers manually instead.');
    }
    btn.textContent = 'Estimate with AI';
  });

  document.getElementById('saveRecipeBtn').addEventListener('click', () => {
    const name = document.getElementById('recipeNameInput').value.trim();
    const calories = Number(document.getElementById('recipeCaloriesInput').value);
    const protein = Number(document.getElementById('recipeProteinInput').value);
    if (!name || !calories) { alert('Name the recipe and enter calories.'); return; }
    const recipes = getSavedRecipes();
    if (editingRecipeId) {
      const r = recipes.find(x => x.id === editingRecipeId);
      if (r) { r.name = name; r.calories = Math.round(calories); r.protein = Math.round(protein || 0); }
    } else {
      recipes.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name, calories: Math.round(calories), protein: Math.round(protein || 0) });
    }
    saveSavedRecipes(recipes);
    resetRecipeForm();
    renderRecipeList();
  });

  // One-time seed so the 7-day average isn't empty while real data builds
  // up. Only fills days that have no real entry yet — once a day is
  // actually logged, this never overwrites it, and as days roll out of the
  // 7-day window the seeded values disappear on their own.
  function seedHistoricalCalories() {
    if (localStorage.getItem('nutrition_seeded')) return;
    const totals = getDailyTotalsMap();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      if (!totals[key]) totals[key] = { calories: 2150, protein: 0 };
    }
    localStorage.setItem('daily_totals', JSON.stringify(totals));
    localStorage.setItem('nutrition_seeded', '1');
  }

  // Static 7-day average — last 7 calendar days excluding today, computed
  // once on load rather than live during the day.
  function render7DayAvgCalories() {
    const totals = getDailyTotalsMap();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let sum = 0, count = 0;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      if (totals[key]) { sum += totals[key].calories; count++; }
    }
    const el = document.getElementById('avgCaloriesValue');
    if (!el) return;
    const unitEl = el.parentElement ? el.parentElement.querySelector('small') : null;
    // Genuinely no data yet until at least one day's food log exists from
    // before today — this fills in naturally after a day or two of use.
    if (count) {
      if (unitEl) unitEl.textContent = 'kcal';
      animateCountUp(el, Math.round(sum / count), 700);
    } else {
      if (unitEl) unitEl.textContent = '';
      el.textContent = 'No data yet';
    }
  }

  // ---- Gym tab: running PBs + 1RMs ----
  const RUNNING_PB_DEFS = [
    { id: 'fivek', label: '5k' },
    { id: 'tenk', label: '10k' }
  ];
  const GYM_1RM_DEFS = [
    { id: 'bench', label: 'Bench Press' },
    { id: 'squat', label: 'Squat' },
    { id: 'deadlift', label: 'Deadlift' },
    { id: 'legpress', label: 'Leg Press' },
    { id: 'curl', label: 'Curl' }
  ];

  function getRunningPbs() {
    try { return JSON.parse(localStorage.getItem('running_pbs') || '{}'); } catch (e) { return {}; }
  }
  function saveRunningPbs(data) {
    localStorage.setItem('running_pbs', JSON.stringify(data));
    syncPush('runningPbs', data);
  }
  async function syncRunningPbsFromRemote() {
    const remote = await syncPull('runningPbs');
    if (remote && typeof remote === 'object') localStorage.setItem('running_pbs', JSON.stringify(remote));
  }
  function getGym1rms() {
    try { return JSON.parse(localStorage.getItem('gym_1rms') || '{}'); } catch (e) { return {}; }
  }
  function saveGym1rms(data) {
    localStorage.setItem('gym_1rms', JSON.stringify(data));
    syncPush('gym1rms', data);
  }
  async function syncGym1rmsFromRemote() {
    const remote = await syncPull('gym1rms');
    if (remote && typeof remote === 'object') localStorage.setItem('gym_1rms', JSON.stringify(remote));
  }

  function timeToSeconds(mmss) {
    const m = mmss.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function formatPbDate(dateStr) {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderRunningPbs() {
    const list = document.getElementById('runningPbList');
    if (!list) return;
    const pbs = getRunningPbs();
    list.innerHTML = '';
    RUNNING_PB_DEFS.forEach(def => {
      const entry = pbs[def.id];
      const row = document.createElement('div');
      row.className = 'pb-row';
      row.innerHTML = `
        <div class="pb-row-main">
          <div class="name">${def.label}</div>
          <div class="value">
            <span class="big">${entry ? entry.time : '--:--'}</span>
            ${entry ? formatPbDate(entry.date) : 'No time set'}
          </div>
        </div>
        <div class="pb-edit" id="pbEdit_${def.id}">
          <div class="prev">${entry ? `Current PB: ${entry.time} (${formatPbDate(entry.date)})` : 'No previous PB'}</div>
          <input type="text" placeholder="mm:ss" id="pbInput_${def.id}">
          <div style="display:flex;gap:8px;">
            <button class="btn" data-pb-save="${def.id}">Save</button>
            <button class="btn secondary" data-pb-cancel="${def.id}">Cancel</button>
          </div>
          <div class="delta" id="pbDelta_${def.id}"></div>
        </div>`;
      row.querySelector('.pb-row-main').addEventListener('click', () => {
        document.querySelectorAll('.pb-edit.open').forEach(el => el.classList.remove('open'));
        document.getElementById(`pbEdit_${def.id}`).classList.add('open');
        document.getElementById(`pbInput_${def.id}`).value = '';
        document.getElementById(`pbDelta_${def.id}`).textContent = '';
      });
      list.appendChild(row);
    });

    list.querySelectorAll('[data-pb-cancel]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById(`pbEdit_${btn.dataset.pbCancel}`).classList.remove('open');
      });
    });
    list.querySelectorAll('[data-pb-save]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.pbSave;
        const input = document.getElementById(`pbInput_${id}`);
        const seconds = timeToSeconds(input.value.trim());
        if (seconds === null) { alert('Enter a time as mm:ss, e.g. 22:15'); return; }
        const pbs = getRunningPbs();
        const prev = pbs[id];
        const deltaEl = document.getElementById(`pbDelta_${id}`);
        if (prev) {
          const diff = seconds - timeToSeconds(prev.time);
          deltaEl.textContent = diff < 0 ? `${Math.abs(diff)}s faster than previous PB` : diff > 0 ? `${diff}s slower than previous PB` : 'Same as previous PB';
          deltaEl.style.color = diff < 0 ? 'var(--green)' : diff > 0 ? 'var(--coral)' : 'var(--muted)';
        }
        pbs[id] = { time: input.value.trim(), date: todayKey() };
        saveRunningPbs(pbs);
        setTimeout(renderRunningPbs, prev ? 1200 : 0);
      });
    });
  }

  function renderGym1rms() {
    const list = document.getElementById('gym1rmList');
    if (!list) return;
    const rms = getGym1rms();
    list.innerHTML = '';
    GYM_1RM_DEFS.forEach(def => {
      const entry = rms[def.id];
      const row = document.createElement('div');
      row.className = 'pb-row';
      row.innerHTML = `
        <div class="pb-row-main">
          <div class="name">${def.label}</div>
          <div class="value">
            <span class="big">${entry ? entry.weight + ' kg' : '-- kg'}</span>
            ${entry ? formatPbDate(entry.date) : 'No weight set'}
          </div>
        </div>
        <div class="pb-edit" id="rmEdit_${def.id}">
          <div class="prev">${entry ? `Current: ${entry.weight} kg (${formatPbDate(entry.date)})` : 'No previous value'}</div>
          <input type="number" placeholder="Weight (kg)" id="rmInput_${def.id}">
          <div style="display:flex;gap:8px;">
            <button class="btn" data-rm-save="${def.id}">Save</button>
            <button class="btn secondary" data-rm-cancel="${def.id}">Cancel</button>
          </div>
          <div class="delta" id="rmDelta_${def.id}"></div>
        </div>`;
      row.querySelector('.pb-row-main').addEventListener('click', () => {
        document.querySelectorAll('.pb-edit.open').forEach(el => el.classList.remove('open'));
        document.getElementById(`rmEdit_${def.id}`).classList.add('open');
        document.getElementById(`rmInput_${def.id}`).value = '';
        document.getElementById(`rmDelta_${def.id}`).textContent = '';
      });
      list.appendChild(row);
    });

    list.querySelectorAll('[data-rm-cancel]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById(`rmEdit_${btn.dataset.rmCancel}`).classList.remove('open');
      });
    });
    list.querySelectorAll('[data-rm-save]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.rmSave;
        const input = document.getElementById(`rmInput_${id}`);
        const weight = Number(input.value);
        if (!weight) { alert('Enter a weight in kg.'); return; }
        const rms = getGym1rms();
        const prev = rms[id];
        const deltaEl = document.getElementById(`rmDelta_${id}`);
        if (prev) {
          const diff = weight - prev.weight;
          deltaEl.textContent = diff > 0 ? `+${diff}kg vs previous` : diff < 0 ? `${diff}kg vs previous` : 'Same as previous';
          deltaEl.style.color = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--coral)' : 'var(--muted)';
        }
        rms[id] = { weight, date: todayKey() };
        saveGym1rms(rms);
        setTimeout(renderGym1rms, prev ? 1200 : 0);
      });
    });
  }

  // ---- Workout Library ----
  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const WORKOUT_TEMPLATES = {
    push: {
      name: 'Push',
      subtitle: 'Chest, shoulders, triceps',
      duration: '~90 mins',
      exercises: [
        { name: 'Bench Press', sets: 4, reps: '5', weight: 80 },
        { name: 'Incline Dumbbell Press', sets: 3, reps: '8', weight: 30 },
        { name: 'Overhead Press', sets: 3, reps: '8', weight: 35 },
        { name: 'Lateral Raises', sets: 3, reps: '12', weight: 10 },
        { name: 'Cable Chest Fly', sets: 3, reps: '12', weight: 15 },
        { name: 'Tricep Pushdown', sets: 3, reps: '12', weight: 20 },
        { name: 'Skull Crushers', sets: 3, reps: '10', weight: 25 },
        { name: 'Plank', sets: 3, reps: '60s', weight: null },
        { name: 'Dead Bug', sets: 3, reps: '10', weight: null }
      ]
    },
    pull: {
      name: 'Pull',
      subtitle: 'Back, biceps, rear delts',
      duration: '~90 mins',
      exercises: [
        { name: 'Deadlift', sets: 4, reps: '5', weight: 80 },
        { name: 'Pull Ups', sets: 4, reps: '6', weight: null },
        { name: 'Barbell Row', sets: 3, reps: '8', weight: 60 },
        { name: 'Seated Cable Row', sets: 3, reps: '10', weight: 40 },
        { name: 'Face Pulls', sets: 3, reps: '15', weight: 15 },
        { name: 'Lat Pulldown', sets: 3, reps: '10', weight: 50 },
        { name: 'Curl', sets: 3, reps: '10', weight: 22.5 },
        { name: 'Reverse Fly', sets: 3, reps: '12', weight: 8 },
        { name: 'Hanging Leg Raise', sets: 3, reps: '10', weight: null },
        { name: 'Dead Hang', sets: 3, reps: '30s', weight: null }
      ]
    }
  };

  function getExerciseWeights() {
    try { return JSON.parse(localStorage.getItem('exercise_weights') || '{}'); } catch (e) { return {}; }
  }
  function saveExerciseWeight(slug, weight) {
    const weights = getExerciseWeights();
    weights[slug] = weight;
    localStorage.setItem('exercise_weights', JSON.stringify(weights));
    syncPush('exerciseWeights', weights);
  }
  async function syncExerciseWeightsFromRemote() {
    const remote = await syncPull('exerciseWeights');
    if (remote && typeof remote === 'object') localStorage.setItem('exercise_weights', JSON.stringify(remote));
  }
  function getWorkoutHistory() {
    try { return JSON.parse(localStorage.getItem('workout_history') || '[]'); } catch (e) { return []; }
  }
  function saveWorkoutHistory(history) {
    localStorage.setItem('workout_history', JSON.stringify(history));
    syncPush('workoutHistory', history);
  }
  async function syncWorkoutHistoryFromRemote() {
    const remote = await syncPull('workoutHistory');
    if (Array.isArray(remote)) localStorage.setItem('workout_history', JSON.stringify(remote));
  }
  function lastCompletedDate(templateId) {
    const history = getWorkoutHistory().filter(h => h.templateId === templateId);
    if (history.length === 0) return null;
    return history[history.length - 1].date;
  }

  let activeSession = null; // { templateId, startTime, exercises: [{name, slug, sets, reps, weight, completedSets:Set}] }
  let sessionTimerInterval = null;

  function renderWorkoutLibrary() {
    const list = document.getElementById('workoutLibraryList');
    if (!list) return;
    list.innerHTML = '';
    Object.keys(WORKOUT_TEMPLATES).forEach(id => {
      const t = WORKOUT_TEMPLATES[id];
      const last = lastCompletedDate(id);
      const card = document.createElement('div');
      card.className = 'workout-card';
      card.innerHTML = `
        <div class="wname">${t.name}</div>
        <div class="wsub">${t.subtitle} · ${t.duration}</div>
        <div class="wmeta">${last ? 'Last completed: ' + formatPbDate(last) : 'Not done yet'}</div>`;
      card.addEventListener('click', () => startWorkoutSession(id));
      list.appendChild(card);
    });
  }

  function startWorkoutSession(templateId) {
    const t = WORKOUT_TEMPLATES[templateId];
    const savedWeights = getExerciseWeights();
    activeSession = {
      templateId,
      startTime: Date.now(),
      exercises: t.exercises.map(ex => {
        const slug = slugify(ex.name);
        const weight = ex.weight === null ? null : (savedWeights[slug] !== undefined ? savedWeights[slug] : ex.weight);
        return { name: ex.name, slug, sets: ex.sets, reps: ex.reps, weight, completedSets: new Set() };
      })
    };
    document.getElementById('activeSessionCard').style.display = '';
    renderActiveSession();
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(updateSessionTimer, 1000);
  }

  function updateSessionTimer() {
    const el = document.getElementById('sessionTimer');
    if (!el || !activeSession) return;
    const elapsed = Math.floor((Date.now() - activeSession.startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  function renderActiveSession() {
    const content = document.getElementById('activeSessionContent');
    if (!content || !activeSession) return;
    const t = WORKOUT_TEMPLATES[activeSession.templateId];
    content.innerHTML = `
      <h2>${t.name} Session</h2>
      <div class="session-timer" id="sessionTimer">00:00</div>
      <div id="sessionExerciseList"></div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn" id="finishSessionBtn">Finish Session</button>
        <button class="btn secondary" id="cancelSessionBtn">Cancel</button>
      </div>`;
    const exList = document.getElementById('sessionExerciseList');
    activeSession.exercises.forEach((ex, idx) => {
      const row = document.createElement('div');
      row.className = 'workout-exercise';
      const setChecks = Array.from({ length: ex.sets }).map((_, i) => `
        <label class="set-check${ex.completedSets.has(i) ? ' done' : ''}" data-exercise-idx="${idx}" data-set-idx="${i}">
          <input type="checkbox" ${ex.completedSets.has(i) ? 'checked' : ''}> Set ${i + 1}
        </label>`).join('');
      row.innerHTML = `
        <div class="workout-exercise-header">
          <div class="name">${ex.name}</div>
          <div class="sets-reps">${ex.sets} × ${ex.reps}</div>
        </div>
        <div class="workout-weight-row">
          ${ex.weight === null
            ? '<span class="placeholder-text">Bodyweight</span>'
            : `<input type="number" step="0.5" value="${ex.weight}" data-exercise-idx="${idx}" class="exercise-weight-input"><span>kg</span>`}
        </div>
        <div class="set-checks">${setChecks}</div>`;
      exList.appendChild(row);
    });

    exList.querySelectorAll('.exercise-weight-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.exerciseIdx);
        const weight = Number(input.value);
        activeSession.exercises[idx].weight = weight;
        saveExerciseWeight(activeSession.exercises[idx].slug, weight);
      });
    });

    exList.querySelectorAll('.set-check').forEach(label => {
      label.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(label.dataset.exerciseIdx);
        const setIdx = Number(label.dataset.setIdx);
        const completed = activeSession.exercises[idx].completedSets;
        const isCompleting = !completed.has(setIdx);
        const commit = () => {
          if (completed.has(setIdx)) completed.delete(setIdx); else completed.add(setIdx);
          const fullyComplete = completed.size === activeSession.exercises[idx].sets;
          renderActiveSession();
          if (isCompleting && fullyComplete && !prefersReducedMotion()) {
            const exRow = document.querySelectorAll('#sessionExerciseList .workout-exercise')[idx];
            if (exRow) {
              exRow.classList.add('all-complete-flash');
              exRow.addEventListener('animationend', () => exRow.classList.remove('all-complete-flash'), { once: true });
            }
          }
        };
        if (isCompleting && !prefersReducedMotion()) {
          label.classList.add('tick-bounce');
          spawnTickBurst(label);
          setTimeout(commit, 300);
        } else {
          commit();
        }
      });
    });

    document.getElementById('finishSessionBtn').addEventListener('click', finishWorkoutSession);
    document.getElementById('cancelSessionBtn').addEventListener('click', cancelWorkoutSession);
    updateSessionTimer();
  }

  function finishWorkoutSession() {
    if (!activeSession) return;
    const durationSeconds = Math.floor((Date.now() - activeSession.startTime) / 1000);
    const totalSets = activeSession.exercises.reduce((sum, ex) => sum + ex.sets, 0);
    const completedSets = activeSession.exercises.reduce((sum, ex) => sum + ex.completedSets.size, 0);
    const history = getWorkoutHistory();
    history.push({
      templateId: activeSession.templateId,
      date: todayKey(),
      durationSeconds,
      completedSets,
      totalSets
    });
    saveWorkoutHistory(history);
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
    activeSession = null;
    document.getElementById('activeSessionCard').style.display = 'none';
    renderWorkoutLibrary();
  }

  function cancelWorkoutSession() {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
    activeSession = null;
    document.getElementById('activeSessionCard').style.display = 'none';
  }

  // ---- Week tab ----
  // Always-editable weekly planner, synced across devices via the same
  // private-GitHub-repo backend as the food log (see api/week.js /
  // api/_github.js). Deliberately not mirrored to localStorage — the
  // remote copy is the only source of truth so two devices never drift.
  const WEEK_PROXY_URL = 'https://dashboard20-iota.vercel.app/api/week';
  const WEEK_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const WEEK_DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WEEK_ICONS = ['💪', '🏃', '🚴', '⛳', '😴', '🎾', '🏊', '🧘', '🛀', '🚶', '🏔️', '🎯', '📖', '💤', '🥗', '💊', '🧠', '🎸', '🏄', '⚽', '🏓', '🤸', '🧗', '🎮'];
  const WEEK_COLOURS = ['green', 'teal', 'coral', 'amber', 'purple', 'grey', 'blue', 'pink'];
  const WEEK_HARD_LABELS = ['Gym — Push', 'Gym — Pull', '5k Hard'];

  function weekUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'wt-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function defaultWeekTasks() {
    return [
      { icon: '💪', label: 'Gym — Push', colour: 'green' },
      { icon: '💪', label: 'Gym — Pull', colour: 'green' },
      { icon: '🏃', label: '5k Hard', colour: 'teal' },
      { icon: '🏃', label: '7.5k Moderate', colour: 'teal' },
      { icon: '🏃', label: '10k Easy', colour: 'teal' },
      { icon: '🚴', label: 'Cycle 40k', colour: 'coral' },
      { icon: '⛳', label: 'Golf / Range', colour: 'amber' },
      { icon: '😴', label: 'Rest', colour: 'grey' },
      { icon: '🎾', label: 'Padel', colour: 'purple' }
    ].map(t => ({ id: weekUuid(), icon: t.icon, label: t.label, colour: t.colour, day: null, done: false }));
  }

  function todayDayIndex() {
    return (new Date().getDay() + 6) % 7; // Mon=0 .. Sun=6
  }

  function getTodaysPlannedTask() {
    if (!weekPlanCache || weekPlanCacheKey !== currentWeekKey()) return null;
    return weekPlanCache.find(t => t.day === todayDayIndex()) || null;
  }

  function getTomorrowsPlannedTask() {
    if (!weekPlanCache || weekPlanCacheKey !== currentWeekKey()) return null;
    return weekPlanCache.find(t => t.day === (todayDayIndex() + 1) % 7) || null;
  }

  function renderHomeUpcomingSession() {
    const el = document.getElementById('homeUpcomingSession');
    if (!el) return;
    const task = getTodaysPlannedTask();
    el.innerHTML = task
      ? `<div class="item-row"><span style="font-size:20px;">${task.icon}</span><span style="font-weight:700;">Today: ${task.label}</span>${task.done ? '<span class="placeholder-text" style="margin-left:auto;">logged ✓</span>' : ''}</div>`
      : '<p class="placeholder-text">No session planned — open the Week tab to plan one.</p>';
  }

  async function fetchWeekPlan(weekKey) {
    const res = await fetch(`${WEEK_PROXY_URL}?week=${weekKey}`);
    if (!res.ok) throw new Error('week_fetch_failed_' + res.status);
    const data = await res.json();
    return data.tasks;
  }

  function setWeekSyncIndicator(active) {
    const el = document.getElementById('weekSyncIndicator');
    if (el) el.classList.toggle('active', active);
  }

  async function saveWeekPlanRemote(weekKey, tasks) {
    setWeekSyncIndicator(true);
    try {
      await fetch(`${WEEK_PROXY_URL}?week=${weekKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks })
      });
    } catch (err) {
      console.error('week save failed', err);
    } finally {
      setWeekSyncIndicator(false);
    }
  }

  function getFjcEventsForWeek(monday) {
    const sunday = new Date(monday.getTime() + 7 * 86400000 - 1);
    try {
      const cached = JSON.parse(localStorage.getItem('fjc_events_cache') || '[]')
        .map(e => ({ ...e, start: new Date(e.start), end: e.end ? new Date(e.end) : new Date(e.start) }));
      return cached.filter(e => e.start >= monday && e.start <= sunday);
    } catch (e) { return []; }
  }

  function getRecoveryBand() {
    const cache = getWhoopDataCache();
    let score = null;
    if (cache && Array.isArray(cache.trendScores) && cache.trendScores.length) {
      const last3 = cache.trendScores.slice(-3);
      score = Math.round(last3.reduce((a, b) => a + b, 0) / last3.length);
    } else {
      const raw = localStorage.getItem('latest_recovery_score');
      score = raw !== null ? Number(raw) : null;
    }
    if (score === null || Number.isNaN(score)) return { score: null, band: null };
    return { score, band: score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red' };
  }

  // Auto-distributes a fresh task set across the week the first time a
  // week's plan is created. After that the plan is just whatever the user
  // last dragged it to — this never runs again for an existing plan.
  function autoDistributeWeekTasks(tasks, lockedDayIndices, band) {
    const used = new Set(lockedDayIndices);
    const hardDays = new Set();
    const ascending = [0, 1, 2, 3, 4, 5, 6];
    const order = band === 'yellow' ? [2, 3, 1, 4, 0, 5, 6]
      : band === 'red' ? [6, 5, 4, 3, 2, 1, 0]
      : ascending;

    const restTask = tasks.find(t => t.label === 'Rest');
    if (band === 'red' && restTask) {
      for (const d of ascending) {
        if (!used.has(d)) { restTask.day = d; used.add(d); break; }
      }
    }

    const hardTasks = tasks.filter(t => WEEK_HARD_LABELS.includes(t.label) && t.day === null);
    hardTasks.forEach(task => {
      for (const d of order) {
        if (used.has(d) || hardDays.has(d - 1) || hardDays.has(d + 1)) continue;
        task.day = d; used.add(d); hardDays.add(d); return;
      }
    });
    hardTasks.forEach(task => {
      if (task.day !== null) return;
      for (const d of ascending) {
        if (!used.has(d)) { task.day = d; used.add(d); hardDays.add(d); return; }
      }
    });

    const remaining = tasks.filter(t => t.day === null && t.label !== 'Padel');
    remaining.forEach(task => {
      for (const d of ascending) {
        if (!used.has(d)) { task.day = d; used.add(d); return; }
      }
    });

    const padelTask = tasks.find(t => t.label === 'Padel' && t.day === null);
    if (padelTask) {
      for (const d of ascending) {
        if (!used.has(d)) { padelTask.day = d; used.add(d); break; }
      }
    }
    return tasks;
  }

  // Both the page-load init sequence and the Week tab's own click handler
  // call this, and on a slow connection the first call can still be
  // in-flight when the second fires. Without this guard each would
  // independently fetch-empty -> regenerate -> save, racing two different
  // freshly-generated task sets against each other.
  let weekTabLoadPromise = null;

  async function loadWeekTab() {
    if (weekTabLoadPromise) return weekTabLoadPromise;
    weekTabLoadPromise = (async () => {
      const weekKey = currentWeekKey();
      const monday = getMonday(new Date());
      try {
        let tasks = await fetchWeekPlan(weekKey);
        if (!tasks || tasks.length === 0) {
          tasks = defaultWeekTasks();
          const fjcEvents = getFjcEventsForWeek(monday);
          const lockedDayIndices = fjcEvents.map(e => (e.start.getDay() + 6) % 7);
          const { band } = getRecoveryBand();
          autoDistributeWeekTasks(tasks, lockedDayIndices, band);
          await saveWeekPlanRemote(weekKey, tasks);
        }
        weekPlanCache = tasks;
        weekPlanCacheKey = weekKey;
      } catch (err) {
        console.error('week load failed', err);
        if (!weekPlanCache) { weekPlanCache = defaultWeekTasks(); weekPlanCacheKey = weekKey; }
      }
      renderWeekTab();
      renderTodaySnapshot();
      renderBriefingPreview();
      if (typeof renderWeeklyTargets === 'function') renderWeeklyTargets();
    })();
    try {
      await weekTabLoadPromise;
    } finally {
      weekTabLoadPromise = null;
    }
  }

  async function persistWeekPlan() {
    if (!weekPlanCache || !weekPlanCacheKey) return;
    await saveWeekPlanRemote(weekPlanCacheKey, weekPlanCache);
    renderWeekTab();
    renderTodaySnapshot();
    renderBriefingPreview();
    if (typeof renderWeeklyTargets === 'function') renderWeeklyTargets();
  }

  function weekChipHtml(task, opts) {
    opts = opts || {};
    const locked = !!opts.locked;
    const draggable = !locked && !task.done;
    const classes = ['week-chip', 'chip-' + task.colour];
    if (task.done) classes.push('is-done');
    return `<span class="${classes.join(' ')}" data-task-id="${task.id}" draggable="${draggable}">
      <span>${task.icon}</span><span>${task.label}</span>
      ${!locked ? `<button class="tick-btn" data-tick-id="${task.id}" aria-label="${task.done ? 'Mark incomplete' : 'Mark complete'}">${task.done ? '↺' : '✓'}</button>` : ''}
      ${!locked ? `<button class="remove-btn" data-remove-id="${task.id}" aria-label="Remove">✕</button>` : ''}
    </span>`;
  }

  function toggleWeekTaskDone(taskId) {
    if (!weekPlanCache) return;
    const task = weekPlanCache.find(t => t.id === taskId);
    if (!task) return;
    task.done = !task.done;
    persistWeekPlan();
  }

  function renderWeekTab() {
    if (!weekPlanCache) return;
    const monday = getMonday(new Date());
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    document.getElementById('weekRangeLabel').textContent = `${formatDate(monday).replace(/^\w+,\s/, '')} – ${formatDate(sunday)}`;

    const fjcEvents = getFjcEventsForWeek(monday);
    const isRaceWeek = fjcEvents.some(e => e.title.toUpperCase().includes('FJC'));
    const lockedDayIndices = new Set(fjcEvents.map(e => (e.start.getDay() + 6) % 7));

    const banner = document.getElementById('weekRaceBanner');
    const poolCard = document.getElementById('weekPoolCard');
    const addBtn = document.getElementById('weekAddTaskBtn');
    const dayGrid = document.getElementById('weekDayGrid');

    if (isRaceWeek) {
      poolCard.style.display = 'none';
      addBtn.style.display = 'none';
      const eventsHtml = fjcEvents.map(e => `<div class="event-row"><span class="name">${e.title}</span><span class="date">${formatDate(e.start)}</span></div>`).join('');
      banner.innerHTML = `<div class="race-week-banner">Race week — rest and prep only</div><div class="card">${eventsHtml || '<p class="placeholder-text">No FJC events found this week.</p>'}</div>`;
      dayGrid.innerHTML = '';
      renderWeekSidePanel();
      return;
    }

    poolCard.style.display = '';
    addBtn.style.display = '';
    banner.innerHTML = '';

    const pool = document.getElementById('weekPool');
    const unassigned = weekPlanCache.filter(t => t.day === null);
    pool.innerHTML = unassigned.length
      ? unassigned.map(t => weekChipHtml(t)).join('')
      : '<p class="placeholder-text" style="font-style:italic;">All sessions assigned</p>';

    const todayIdx = todayDayIndex();
    dayGrid.innerHTML = WEEK_DAY_NAMES.map((name, idx) => {
      const date = new Date(monday.getTime() + idx * 86400000);
      const dayTasks = weekPlanCache.filter(t => t.day === idx);
      const lockedEvents = fjcEvents.filter(e => (e.start.getDay() + 6) % 7 === idx);
      const lockedChips = lockedEvents.map(e => `<span class="week-chip locked-chip">🔒 ${e.title}</span>`).join('');
      const chips = dayTasks.map(t => weekChipHtml(t)).join('');
      const dayComplete = dayTasks.length > 0 && dayTasks.every(t => t.done);
      return `<div class="week-day-card${idx === todayIdx ? ' is-today' : ''}" data-day-idx="${idx}">
        <div class="week-day-card-header">
          <span class="day-name">${WEEK_DAY_SHORT[idx]}${dayComplete ? '<span class="day-complete-badge">✅</span>' : ''}</span>
          <span class="day-date">${date.getDate()}/${date.getMonth() + 1}</span>
        </div>
        <div class="week-day-chips" data-day-idx="${idx}">${lockedChips}${chips}</div>
      </div>`;
    }).join('');

    attachWeekDragHandlers();
    renderWeekSidePanel();
  }

  function renderWeekSidePanel() {
    if (!weekPlanCache) return;
    const todayTask = getTodaysPlannedTask();
    const tomorrowTask = getTomorrowsPlannedTask();
    const todayEl = document.getElementById('weekTodayContent');
    const tomorrowEl = document.getElementById('weekTomorrowContent');
    if (todayEl) {
      todayEl.innerHTML = todayTask
        ? `<div class="item-row"><span style="font-size:20px;">${todayTask.icon}</span><span style="font-weight:700;">${todayTask.label}</span>${todayTask.done ? '<span class="placeholder-text" style="margin-left:auto;">logged ✓</span>' : ''}</div>`
        : '<p class="placeholder-text">Nothing planned today.</p>';
    }
    if (tomorrowEl) {
      tomorrowEl.innerHTML = tomorrowTask
        ? `<div class="item-row"><span style="font-size:20px;">${tomorrowTask.icon}</span><span style="font-weight:700;">${tomorrowTask.label}</span></div>`
        : '<p class="placeholder-text">Nothing planned tomorrow.</p>';
    }

    const progressEl = document.getElementById('weekProgressDetail');
    if (progressEl) {
      const groups = [
        { label: 'Gym', match: t => t.label.startsWith('Gym') },
        { label: 'Runs', match: t => /\d+(\.\d+)?k/i.test(t.label) && !t.label.toLowerCase().includes('cycle') },
        { label: 'Cycle', match: t => t.label.toLowerCase().includes('cycle') },
        { label: 'Golf', match: t => t.label.toLowerCase().includes('golf') }
      ];
      progressEl.innerHTML = groups.map(g => {
        const planned = weekPlanCache.filter(g.match);
        if (!planned.length) return '';
        const done = planned.filter(t => t.done).length;
        const pct = Math.round((done / planned.length) * 100);
        return `<div class="week-progress-row">
          <div class="label"><span>${g.label}</span><span>${done} / ${planned.length}</span></div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%;"></div></div>
        </div>`;
      }).join('') || '<p class="placeholder-text">No planned sessions yet.</p>';
    }
  }

  async function moveWeekTask(taskId, newDay) {
    const task = weekPlanCache.find(t => t.id === taskId);
    if (!task || task.done) return;
    task.day = newDay;
    await persistWeekPlan();
    if (!prefersReducedMotion()) {
      const chip = document.querySelector(`.week-chip[data-task-id="${taskId}"]`);
      if (chip) {
        chip.classList.add('drop-bounce');
        chip.addEventListener('animationend', () => chip.classList.remove('drop-bounce'), { once: true });
      }
    }
  }

  function removeWeekTask(taskId) {
    weekPlanCache = weekPlanCache.filter(t => t.id !== taskId);
    persistWeekPlan();
  }

  function attachWeekDragHandlers() {
    document.querySelectorAll('#weekDayGrid .week-chip[draggable="true"], #weekPool .week-chip[draggable="true"]').forEach(chip => {
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', chip.dataset.taskId);
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    });
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeWeekTask(btn.dataset.removeId);
      });
    });
    document.querySelectorAll('.tick-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWeekTaskDone(btn.dataset.tickId);
      });
    });

    const dropZones = [...document.querySelectorAll('.week-day-chips'), document.getElementById('weekPool')];
    dropZones.forEach(zone => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drop-target'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-target'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drop-target');
        const taskId = e.dataTransfer.getData('text/plain');
        const dayAttr = zone.dataset.dayIdx;
        moveWeekTask(taskId, dayAttr !== undefined ? Number(dayAttr) : null);
      });
    });
  }

  // ---- Add task modal ----
  let weekModalState = { icon: WEEK_ICONS[0], colour: WEEK_COLOURS[0], days: new Set() };

  function renderWeekIconGrid() {
    const grid = document.getElementById('weekIconGrid');
    grid.innerHTML = WEEK_ICONS.map(icon =>
      `<button type="button" class="${icon === weekModalState.icon ? 'selected' : ''}" data-icon="${icon}">${icon}</button>`
    ).join('');
    grid.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        weekModalState.icon = btn.dataset.icon;
        renderWeekIconGrid();
        updateWeekPreviewChip();
      });
    });
  }

  const WEEK_COLOUR_HEX = {
    green: '#1D9E75', teal: '#0E8A9E', coral: '#E05C3A', amber: '#D4920A',
    purple: '#7C5CBF', grey: '#555555', blue: '#2563EB', pink: '#C2185B'
  };

  function renderWeekColourRow() {
    const row = document.getElementById('weekColourRow');
    row.innerHTML = WEEK_COLOURS.map(c =>
      `<span class="week-colour-swatch${c === weekModalState.colour ? ' selected' : ''}" data-colour="${c}" style="background:${WEEK_COLOUR_HEX[c]};"></span>`
    ).join('');
    row.querySelectorAll('.week-colour-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        weekModalState.colour = sw.dataset.colour;
        renderWeekColourRow();
        updateWeekPreviewChip();
      });
    });
  }

  function renderWeekDayBtns() {
    const wrap = document.getElementById('weekDayBtns');
    wrap.innerHTML = WEEK_DAY_SHORT.map((d, idx) =>
      `<button type="button" class="${weekModalState.days.has(idx) ? 'selected' : ''}" data-day-idx="${idx}">${d}</button>`
    ).join('');
    wrap.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.dayIdx);
        if (weekModalState.days.has(idx)) weekModalState.days.delete(idx); else weekModalState.days.add(idx);
        renderWeekDayBtns();
      });
    });
  }

  function updateWeekPreviewChip() {
    const name = document.getElementById('weekTaskNameInput').value.trim() || 'New task';
    const previewTask = { icon: weekModalState.icon, label: name, colour: weekModalState.colour, done: false };
    document.getElementById('weekPreviewRow').innerHTML = weekChipHtml(previewTask, { locked: true });
  }

  function openWeekModal() {
    weekModalState = { icon: WEEK_ICONS[0], colour: WEEK_COLOURS[0], days: new Set() };
    document.getElementById('weekTaskNameInput').value = '';
    renderWeekIconGrid();
    renderWeekColourRow();
    renderWeekDayBtns();
    updateWeekPreviewChip();
    document.getElementById('weekModalOverlay').classList.add('open');
  }

  function closeWeekModal() {
    document.getElementById('weekModalOverlay').classList.remove('open');
  }

  function submitWeekTask() {
    const name = document.getElementById('weekTaskNameInput').value.trim();
    if (!name) { alert('Give the task a name first.'); return; }
    if (!weekPlanCache) weekPlanCache = [];
    const days = weekModalState.days.size ? [...weekModalState.days] : [null];
    days.forEach(day => {
      weekPlanCache.push({ id: weekUuid(), icon: weekModalState.icon, label: name, colour: weekModalState.colour, day, done: false });
    });
    weekPlanCacheKey = currentWeekKey();
    closeWeekModal();
    persistWeekPlan();
  }

  document.getElementById('weekAddTaskBtn').addEventListener('click', openWeekModal);
  document.getElementById('weekAddTaskBtn2').addEventListener('click', openWeekModal);
  document.getElementById('weekModalCloseBtn').addEventListener('click', closeWeekModal);
  document.getElementById('weekModalCancelBtn').addEventListener('click', closeWeekModal);
  document.getElementById('weekModalSaveBtn').addEventListener('click', submitWeekTask);
  document.getElementById('weekTaskNameInput').addEventListener('input', updateWeekPreviewChip);
  document.getElementById('weekModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('weekModalOverlay')) closeWeekModal();
  });

  // Training-tab tick-off -> matching Week-plan task, by keyword on label.
  const WEEK_TARGET_KEYWORDS = {
    gym1: ['gym'], gym2: ['gym'],
    run5k: ['5k'], run7_5k: ['7.5k'], run10k: ['10k'],
    cycle40k: ['cycle'], golf: ['golf'], padel: ['padel'], rest: ['rest']
  };

  function markWeekTaskDoneForTarget(targetId, done) {
    if (!weekPlanCache || weekPlanCacheKey !== currentWeekKey()) return;
    const keywords = WEEK_TARGET_KEYWORDS[targetId];
    if (!keywords) return;
    const match = done
      ? weekPlanCache.find(t => !t.done && keywords.some(k => t.label.toLowerCase().includes(k)))
      : weekPlanCache.find(t => t.done && keywords.some(k => t.label.toLowerCase().includes(k)));
    if (match) { match.done = done; persistWeekPlan(); }
  }

  window.addEventListener('load', () => {
    setTimeout(async () => {
      seedHistoricalCalories();
      syncFoodLogFromRemote();
      render7DayAvgCalories();
      renderTodaySnapshot();
      renderBriefingPreview();
      if (!getStoredToken()) renderNextRaceCard(null);

      // Pull every other synced data type before its first render, so a
      // freshly opened device shows whatever was last saved elsewhere
      // instead of an empty/stale local copy. Each pull silently no-ops if
      // the sync backend isn't configured yet (see api/_github.js).
      await Promise.all([
        syncSavedRecipesFromRemote(),
        syncRunningPbsFromRemote(),
        syncGym1rmsFromRemote(),
        syncExerciseWeightsFromRemote(),
        syncWorkoutHistoryFromRemote(),
        syncWeeklyTargetsFromRemote()
      ]);
      renderRecipeList();
      renderRunningPbs();
      renderGym1rms();
      renderWorkoutLibrary();
      await loadWeekTab();
      updateTrainingPlan();
    }, 400);
  });

  // ==== PA tab: Personal Assistant (full calendar + Gmail triage + chat) ====

  let paCalendarViewMode = 'month';
  let paCalendarCursor = new Date();
  let paAllEvents = [];
  let paSelectedDayKey = null;
  let paEmails = [];
  let paSelectedEmailId = null;
  let paChatHistory = [];
  let paCurrentDraft = '';
  let paLoadPromise = null;

  const PA_EVENTS_CACHE_KEY = 'pa_all_events_cache';
  const PA_EVENTS_CACHE_DATE_KEY = 'pa_all_events_cache_date';
  const PA_EMAILS_CACHE_KEY = 'pa_emails_cache';
  const PA_EMAILS_CACHE_DATE_KEY = 'pa_emails_cache_date';

  // Simple keyword classifier — cheap and instant, run against title +
  // description at render time rather than burning a Claude call per event.
  function classifyEventCategory(title, description) {
    const t = ((title || '') + ' ' + (description || '')).toLowerCase();
    if (/\bfjc\b|race|qualifying/.test(t)) return { category: 'racing', chipClass: 'cat-racing' };
    if (/\btest\b|shakedown/.test(t)) return { category: 'test', chipClass: 'cat-test' };
    if (/travel|flight|hotel|drive to/.test(t)) return { category: 'travel', chipClass: 'cat-travel' };
    if (/meeting|\bcall\b|zoom|debrief/.test(t)) return { category: 'meeting', chipClass: 'cat-meeting' };
    return { category: 'other', chipClass: 'cat-other' };
  }

  function paMonthLabel(d) {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function paWeekLabel(monday) {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return `${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }

  function renderPaCalendarLabel() {
    const el = document.getElementById('paCalendarLabel');
    if (!el) return;
    el.textContent = paCalendarViewMode === 'month' ? paMonthLabel(paCalendarCursor) : paWeekLabel(getMonday(paCalendarCursor));
  }

  function paEventsOnDay(dateKey) {
    return paAllEvents.filter(e => localDateKey(e.start) === dateKey);
  }

  function renderPaMonthGrid() {
    const grid = document.getElementById('paCalendarMonthGrid');
    if (!grid) return;
    grid.innerHTML = '';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(w => {
      const label = document.createElement('div');
      label.className = 'pa-month-weekday';
      label.textContent = w;
      grid.appendChild(label);
    });

    const year = paCalendarCursor.getFullYear();
    const month = paCalendarCursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = getMonday(firstOfMonth);
    const todayK = todayKey();

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      const dKey = localDateKey(d);
      const cell = document.createElement('div');
      cell.className = 'pa-month-day';
      if (d.getMonth() !== month) cell.classList.add('other-month');
      if (dKey === todayK) cell.classList.add('is-today');
      if (dKey === paSelectedDayKey) cell.classList.add('is-selected');
      cell.dataset.dateKey = dKey;

      const num = document.createElement('div');
      num.className = 'day-num';
      num.textContent = d.getDate();
      cell.appendChild(num);

      const dayEvents = paEventsOnDay(dKey);
      dayEvents.slice(0, 2).forEach(ev => {
        const chip = document.createElement('div');
        chip.className = 'pa-event-chip ' + classifyEventCategory(ev.title).chipClass;
        chip.textContent = ev.title;
        cell.appendChild(chip);
      });
      if (dayEvents.length > 2) {
        const more = document.createElement('div');
        more.className = 'more-chip';
        more.textContent = `+${dayEvents.length - 2} more`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => selectPaDay(dKey));
      grid.appendChild(cell);

      // Stop once we've rendered a full trailing week past month end.
      if (i >= 34 && d.getMonth() !== month && d.getDay() === 0) break;
    }
  }

  function renderPaWeekGrid() {
    const grid = document.getElementById('paCalendarWeekGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const monday = getMonday(paCalendarCursor);
    const todayK = todayKey();
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const dKey = localDateKey(d);
      const col = document.createElement('div');
      col.className = 'pa-week-day-col';
      if (dKey === todayK) col.classList.add('is-today');
      const label = document.createElement('div');
      label.className = 'day-label';
      label.textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      col.appendChild(label);

      paEventsOnDay(dKey)
        .sort((a, b) => a.start - b.start)
        .forEach(ev => {
          const chip = document.createElement('div');
          const cls = classifyEventCategory(ev.title);
          chip.className = 'pa-week-event pa-event-chip ' + cls.chipClass;
          chip.textContent = (ev.allDay ? '' : formatTime(ev.start) + ' ') + ev.title;
          chip.addEventListener('click', () => selectPaDay(dKey));
          col.appendChild(chip);
        });

      grid.appendChild(col);
    }
  }

  function selectPaDay(dateKey) {
    paSelectedDayKey = dateKey;
    if (paCalendarViewMode === 'month') renderPaMonthGrid();
    renderPaDayDetail();
    highlightEmailsForDay(dateKey);
  }

  function renderPaDayDetail() {
    const el = document.getElementById('paCalendarDayDetail');
    if (!el) return;
    if (!paSelectedDayKey) { el.innerHTML = ''; return; }
    const events = paEventsOnDay(paSelectedDayKey).sort((a, b) => a.start - b.start);
    const dateLabel = new Date(paSelectedDayKey + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    if (events.length === 0) {
      el.innerHTML = `<p class="placeholder-text">No events on ${dateLabel}.</p>`;
      return;
    }
    el.innerHTML = `<p class="placeholder-text" style="color:var(--ink);font-weight:700;">${dateLabel}</p>` +
      events.map(ev => {
        const cls = classifyEventCategory(ev.title);
        return `<div class="event-row" style="border-left-color:var(--${cls.category === 'racing' ? 'red' : cls.category === 'test' ? 'amber' : cls.category === 'travel' ? 'blue' : cls.category === 'meeting' ? 'purple' : 'grey-text'});"><span class="name">${ev.title}</span><span class="date">${ev.allDay ? 'All day' : formatTime(ev.start)}</span></div>`;
      }).join('');
  }

  // If any visible emails mention the selected day's event location/title
  // keywords, highlight them so the connection between calendar and inbox
  // is visible at a glance.
  function highlightEmailsForDay(dateKey) {
    const events = paEventsOnDay(dateKey);
    const keywords = events.flatMap(ev => ev.title.toLowerCase().split(/\s+/)).filter(w => w.length > 3);
    document.querySelectorAll('.pa-email-card').forEach(card => {
      const text = (card.dataset.searchText || '').toLowerCase();
      const match = keywords.some(kw => text.includes(kw));
      card.classList.toggle('day-highlight', match && keywords.length > 0);
    });
  }

  function switchPaCalendarView(mode) {
    paCalendarViewMode = mode;
    document.querySelectorAll('#paCalendarViewSegmented .segmented-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
    document.getElementById('paCalendarMonthGrid').style.display = mode === 'month' ? 'grid' : 'none';
    document.getElementById('paCalendarWeekGrid').style.display = mode === 'week' ? 'grid' : 'none';
    renderPaCalendarLabel();
    if (mode === 'month') renderPaMonthGrid(); else renderPaWeekGrid();
  }

  document.querySelectorAll('#paCalendarViewSegmented .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPaCalendarView(btn.dataset.view));
  });

  function navigatePaCalendar(dir) {
    if (paCalendarViewMode === 'month') paCalendarCursor.setMonth(paCalendarCursor.getMonth() + dir);
    else paCalendarCursor.setDate(paCalendarCursor.getDate() + dir * 7);
    paCalendarCursor = new Date(paCalendarCursor);
    renderPaCalendarLabel();
    if (paCalendarViewMode === 'month') renderPaMonthGrid(); else renderPaWeekGrid();
  }

  document.getElementById('paCalPrevBtn').addEventListener('click', () => navigatePaCalendar(-1));
  document.getElementById('paCalNextBtn').addEventListener('click', () => navigatePaCalendar(1));
  document.getElementById('paCalTodayBtn').addEventListener('click', () => {
    paCalendarCursor = new Date();
    renderPaCalendarLabel();
    if (paCalendarViewMode === 'month') renderPaMonthGrid(); else renderPaWeekGrid();
  });

  async function loadPaCalendar(force) {
    const placeholder = document.getElementById('paCalendarPlaceholder');
    const cacheDate = localStorage.getItem(PA_EVENTS_CACHE_DATE_KEY);
    const cachedRaw = localStorage.getItem(PA_EVENTS_CACHE_KEY);
    if (!force && cacheDate === todayKey() && cachedRaw) {
      paAllEvents = reviveEventDates(cachedRaw);
      placeholder.style.display = 'none';
      renderPaCalendarLabel();
      renderPaMonthGrid();
      return;
    }
    const token = getStoredToken();
    if (!token) {
      placeholder.style.display = 'block';
      paAllEvents = [];
      renderPaCalendarLabel();
      renderPaMonthGrid();
      return;
    }
    placeholder.style.display = 'none';
    try {
      paAllEvents = await fetchCalendarEvents(token.access_token, CALENDAR_ID, 45, 90);
      localStorage.setItem(PA_EVENTS_CACHE_KEY, JSON.stringify(paAllEvents));
      localStorage.setItem(PA_EVENTS_CACHE_DATE_KEY, todayKey());
    } catch (err) {
      console.error(err);
      if (cachedRaw) paAllEvents = reviveEventDates(cachedRaw);
    }
    renderPaCalendarLabel();
    if (paCalendarViewMode === 'month') renderPaMonthGrid(); else renderPaWeekGrid();
  }

  // ---- Email feed ----

  function paTruncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function renderPaEmailSkeletons() {
    const feed = document.getElementById('paEmailFeed');
    feed.innerHTML = Array(4).fill('<div class="pa-skeleton-card"></div>').join('');
  }

  function renderPaEmailFeed() {
    const feed = document.getElementById('paEmailFeed');
    const statusLine = document.getElementById('paStatusLine');
    statusLine.textContent = '';
    if (!getStoredToken()) {
      feed.innerHTML = '<p class="placeholder-text">Connect Google Calendar (Calendar tab) to load your inbox — Gmail access is granted together with Calendar.</p>';
      return;
    }
    if (paEmails.length === 0) {
      feed.innerHTML = '<p class="placeholder-text">Nothing relevant in your unread inbox right now.</p>';
      return;
    }
    feed.innerHTML = '';
    paEmails.forEach(email => {
      const card = document.createElement('div');
      card.className = `pa-email-card cat-${email.category}` + (email.id === paSelectedEmailId ? ' selected' : '');
      card.dataset.searchText = (email.subject + ' ' + email.summary + ' ' + email.body).toLowerCase();
      card.innerHTML = `
        <div class="pa-email-top-row">
          ${email.unread ? '<span class="pa-email-unread-dot"></span>' : ''}
          <span class="pa-email-sender">${email.from.name}</span>
          <span class="pa-email-time">${formatDate(email.date)}</span>
        </div>
        <div class="pa-email-subject">${paTruncate(email.subject, 60)}</div>
        <div class="pa-email-summary">${email.summary}</div>
        ${email.needs_reply ? '<span class="pa-needs-reply-badge">Needs reply</span>' : ''}
      `;
      card.addEventListener('click', () => selectPaEmail(email.id));
      feed.appendChild(card);
    });
  }

  async function loadPaEmails(force) {
    const statusLine = document.getElementById('paStatusLine');
    const refreshBtn = document.getElementById('paRefreshBtn');
    const token = getStoredToken();
    if (!token) { renderPaEmailFeed(); return; }

    const cacheDate = localStorage.getItem(PA_EMAILS_CACHE_DATE_KEY);
    const cachedRaw = localStorage.getItem(PA_EMAILS_CACHE_KEY);
    if (!force && cacheDate === todayKey() && cachedRaw) {
      try {
        paEmails = JSON.parse(cachedRaw).map(e => ({ ...e, date: new Date(e.date) }));
        renderPaEmailFeed();
        updateHomeNeedsReplyBadge();
        return;
      } catch (e) { /* fall through to refetch */ }
    }

    if (!getAnthropicKey()) {
      statusLine.textContent = 'Save your Anthropic API key (Briefing tab) to enable email triage.';
      renderPaEmailSkeletons();
      document.getElementById('paEmailFeed').innerHTML = '<p class="placeholder-text">Save your Anthropic API key on the Briefing tab first — it\'s needed to triage and summarise emails.</p>';
      return;
    }

    refreshBtn.classList.add('spinning');
    renderPaEmailSkeletons();
    statusLine.textContent = 'Fetching your inbox…';
    try {
      const threads = await fetchGmailThreads(token.access_token, 50);
      statusLine.textContent = 'Claude is reading your emails…';
      const triaged = await triageEmailsWithClaude(threads);
      const byId = new Map(threads.map(t => [t.id, t]));
      paEmails = triaged
        .filter(t => t.relevance_score >= 5 && byId.has(t.id))
        .sort((a, b) => (b.relevance_score - a.relevance_score) || (byId.get(b.id).date - byId.get(a.id).date))
        .map(t => ({ ...byId.get(t.id), summary: t.summary, category: t.category || 'other', needs_reply: !!t.needs_reply }));
      localStorage.setItem(PA_EMAILS_CACHE_KEY, JSON.stringify(paEmails));
      localStorage.setItem(PA_EMAILS_CACHE_DATE_KEY, todayKey());
      statusLine.textContent = '';
      renderPaEmailFeed();
      updateHomeNeedsReplyBadge();
    } catch (err) {
      console.error(err);
      statusLine.textContent = 'Could not load/triage inbox — try refreshing.';
      if (cachedRaw) {
        try { paEmails = JSON.parse(cachedRaw).map(e => ({ ...e, date: new Date(e.date) })); renderPaEmailFeed(); } catch (e) {}
      } else {
        document.getElementById('paEmailFeed').innerHTML = '';
      }
    } finally {
      refreshBtn.classList.remove('spinning');
    }
  }

  document.getElementById('paRefreshBtn').addEventListener('click', () => loadPaEmails(true));

  function updateHomeNeedsReplyBadge() {
    const count = paEmails.filter(e => e.needs_reply).length;
    localStorage.setItem(PA_NEEDS_REPLY_COUNT_KEY, String(count));
    renderBriefingPreview();
  }

  // ---- Email detail, draft, send ----

  function openPaDetail() {
    document.getElementById('paDetailOverlay').classList.add('open');
    document.getElementById('paDetailBackdrop').classList.add('open');
  }

  function closePaDetail() {
    document.getElementById('paDetailOverlay').classList.remove('open');
    document.getElementById('paDetailBackdrop').classList.remove('open');
    paSelectedEmailId = null;
    renderPaEmailFeed();
  }

  document.getElementById('paDetailCloseBtn').addEventListener('click', closePaDetail);
  document.getElementById('paDetailBackdrop').addEventListener('click', closePaDetail);

  async function selectPaEmail(id) {
    paSelectedEmailId = id;
    paChatHistory = [];
    renderPaEmailFeed();
    openPaDetail();
    const email = paEmails.find(e => e.id === id);
    if (!email) return;

    const panel = document.getElementById('paDetailPanel');
    panel.innerHTML = paDetailShellHtml(email, null);

    if (email.needs_reply) {
      try {
        paCurrentDraft = await draftReplyWithClaude(email);
      } catch (err) {
        console.error(err);
        paCurrentDraft = '';
      }
      if (paSelectedEmailId === id) panel.innerHTML = paDetailShellHtml(email, paCurrentDraft);
    }
    wirePaDetailActions(email);
  }

  function paDetailShellHtml(email, draft) {
    return `
      <div class="pa-detail-header">
        <h3>${email.subject}</h3>
        <div class="pa-detail-meta">From: ${email.from.name} &lt;${email.from.email}&gt;<br>${formatDate(email.date)} · ${formatTime(email.date)}</div>
      </div>
      <div class="pa-detail-body">${email.body || email.snippet}</div>
      <div class="pa-summary-card">
        <div class="pa-card-label">Claude's summary</div>
        <div class="pa-card-text">${email.summary}</div>
      </div>
      ${email.needs_reply ? `
        <div class="pa-draft-card">
          <div class="pa-card-label">Suggested reply</div>
          <div class="pa-card-text" id="paDraftText">${draft === null ? 'Drafting reply…' : draft}</div>
          ${draft !== null ? `
            <div class="pa-draft-actions">
              <button class="btn secondary" id="paRefineBtn">Refine with Claude</button>
              <button class="btn" id="paSendBtn">Send reply</button>
            </div>
          ` : ''}
        </div>
        <div class="pa-chat-panel" id="paChatPanel" style="display:none;">
          <div class="pa-chat-messages" id="paChatMessages"></div>
          <div class="pa-chat-input-row">
            <input type="text" id="paChatInput" placeholder="e.g. make it shorter">
            <button class="btn" id="paChatSendBtn">Send</button>
          </div>
          <button class="btn secondary" id="paUseDraftBtn" style="margin-top:8px;width:100%;">Use this draft</button>
        </div>
      ` : ''}
    `;
  }

  function wirePaDetailActions(email) {
    const refineBtn = document.getElementById('paRefineBtn');
    const sendBtn = document.getElementById('paSendBtn');
    const chatPanel = document.getElementById('paChatPanel');
    if (refineBtn) {
      refineBtn.addEventListener('click', () => {
        chatPanel.style.display = chatPanel.style.display === 'none' ? 'block' : 'none';
        renderPaChat();
      });
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', () => openPaSendConfirm(email));
    }
    const chatSendBtn = document.getElementById('paChatSendBtn');
    const chatInput = document.getElementById('paChatInput');
    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', () => sendPaChatMessage(email));
      chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendPaChatMessage(email); });
    }
    const useDraftBtn = document.getElementById('paUseDraftBtn');
    if (useDraftBtn) {
      useDraftBtn.addEventListener('click', () => {
        chatPanel.style.display = 'none';
      });
    }
  }

  function renderPaChat() {
    const container = document.getElementById('paChatMessages');
    if (!container) return;
    container.innerHTML = '';
    if (paChatHistory.length === 0) {
      container.innerHTML = '<p class="placeholder-text">Tell Claude how to adjust the draft.</p>';
      return;
    }
    paChatHistory.forEach(m => {
      const bubble = document.createElement('div');
      bubble.className = 'pa-chat-bubble ' + (m.role === 'user' ? 'user' : 'assistant');
      bubble.textContent = m.content;
      container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;
  }

  async function sendPaChatMessage(email) {
    const input = document.getElementById('paChatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    paChatHistory.push({ role: 'user', content: text });
    renderPaChat();
    try {
      const updatedDraft = await refineDraftWithClaude(email, paCurrentDraft, paChatHistory, text);
      paCurrentDraft = updatedDraft;
      paChatHistory.push({ role: 'assistant', content: 'Updated the draft above.' });
      const draftTextEl = document.getElementById('paDraftText');
      if (draftTextEl) draftTextEl.textContent = paCurrentDraft;
    } catch (err) {
      console.error(err);
      paChatHistory.push({ role: 'assistant', content: 'Something went wrong — try again.' });
    }
    renderPaChat();
  }

  function openPaSendConfirm(email) {
    document.getElementById('paSendConfirmText').textContent = `Send this reply to ${email.from.name}?`;
    document.getElementById('paSendConfirmOverlay').classList.add('open');
    const sendBtn = document.getElementById('paSendConfirmSendBtn');
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', async () => {
      const token = getStoredToken();
      if (!token) return;
      newSendBtn.textContent = 'Sending…';
      newSendBtn.disabled = true;
      try {
        await sendGmailReply(token.access_token, {
          to: email.from.email,
          subject: email.subject,
          body: paCurrentDraft,
          threadId: email.threadId,
          inReplyTo: email.messageIdHeader
        });
        document.getElementById('paSendConfirmOverlay').classList.remove('open');
        closePaDetail();
        paEmails = paEmails.filter(e => e.id !== email.id);
        localStorage.setItem(PA_EMAILS_CACHE_KEY, JSON.stringify(paEmails));
        renderPaEmailFeed();
        updateHomeNeedsReplyBadge();
      } catch (err) {
        console.error(err);
        alert('Failed to send — check your connection and try again.');
        newSendBtn.textContent = 'Send';
        newSendBtn.disabled = false;
      }
    });
  }

  document.getElementById('paSendConfirmCloseBtn').addEventListener('click', () => {
    document.getElementById('paSendConfirmOverlay').classList.remove('open');
  });
  document.getElementById('paSendConfirmCancelBtn').addEventListener('click', () => {
    document.getElementById('paSendConfirmOverlay').classList.remove('open');
  });

  function loadPaTab(force) {
    if (paLoadPromise && !force) return paLoadPromise;
    paLoadPromise = Promise.all([loadPaCalendar(force), loadPaEmails(force)]).finally(() => { paLoadPromise = null; });
    return paLoadPromise;
  }
