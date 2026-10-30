// Disposable local preview: no product license, real teacher data or API calls.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { classroomData } from './mobile-classroom-fixtures.ts';

const phase = process.env.CAPTURE_PHASE || 'after';
const origin = process.env.CAPTURE_ORIGIN || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const data = classroomData();
  const subjects = ['语文', '数学', '英语', '物理', '化学', '地理'];
  data.savedExams = [0, 1].map(exam => ({
    id: `performance-${exam}`, name: `合成考试${exam + 1}`, date: `2026-09-0${exam + 1}`,
    savedAt: '2026-09-01T00:00:00Z', studentCount: 60, subjectCount: subjects.length, subjects,
    entries: data.students.map((student, index) => {
      const scores = Object.fromEntries(subjects.map((subject, column) => [subject, { score: 30 + (index * 11 + column * 7 + exam * 5) % 71, rankClass: null, rankSchool: null }]));
      return { name: student.name, studentId: student.id, scores, total: { score: Object.values(scores).reduce((sum, cell) => sum + cell.score, 0), rankClass: null, rankSchool: null } };
    }),
  }));
  await page.addInitScript(data => {
    if (localStorage.getItem('seat-manager-workspaces-v1')) return;
    const createdAt = '2026-09-01T00:00:00Z';
    localStorage.setItem('seat-manager-workspaces-v1', JSON.stringify({ version: 1, currentSliceId: 'performance', slices: [{ id: 'performance', classId: 'performance', className: '合成性能测试班', term: { id: 'term', year: 2026, season: 'autumn', label: '2026 秋', createdAt }, createdAt, updatedAt: createdAt, data }] }));
  }, data);
  await page.goto(`${origin}/seat-manager/`);
  await page.getByRole('button', { name: '进入本地预览', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '成绩', exact: true }).click();
  await page.locator('.grade-main-chart svg').waitFor();
  await page.locator('.app-motion-switch[data-moving]').waitFor({ state: 'detached' });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const results = [];
  for (const subject of ['语文', '数学', '英语', '物理', '化学', '地理', '全部', '语文', '数学', '地理', '全部']) {
    await page.evaluate(() => {
      const state = { started: 0, firstFrame: 0, lastFrame: 0, gaps: [], mutations: 0, nodes: document.querySelectorAll('*').length };
      const host = document.querySelector('.grade-chart-transition');
      const observer = new MutationObserver(records => { state.mutations += records.length; });
      observer.observe(host, { subtree: true, attributes: true, childList: true });
      const start = () => {
        state.started = performance.now();
        const sample = now => {
          if (!state.firstFrame) state.firstFrame = performance.now() - state.started;
          if (state.lastFrame) state.gaps.push(now - state.lastFrame);
          state.lastFrame = now;
          if (now - state.started < 420) requestAnimationFrame(sample);
          else { observer.disconnect(); state.done = true; }
        };
        requestAnimationFrame(sample);
      };
      document.querySelector('[role="toolbar"][aria-label="成绩学科切换"]').addEventListener('click', start, { capture: true, once: true });
      window.gradePerformanceSample = state;
    });
    await page.getByRole('toolbar', { name: '成绩学科切换' }).getByRole('button', { name: subject, exact: true }).click();
    await page.waitForFunction(() => window.gradePerformanceSample.done);
    results.push({ subject, ...await page.evaluate(() => {
      const state = window.gradePerformanceSample;
      return { firstFrameMs: Math.round(state.firstFrame * 10) / 10, frames: state.gaps.length, slowFrames: state.gaps.filter(gap => gap > 25).length, maxFrameMs: Math.round(Math.max(...state.gaps) * 10) / 10, mutations: state.mutations, nodes: state.nodes };
    }) });
  }
  const { profile } = await cdp.send('Profiler.stop');
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const self = new Map();
  profile.samples.forEach((id, index) => {
    const frame = nodes.get(id).callFrame;
    if (['(idle)', '(program)'].includes(frame.functionName)) return;
    const key = `${frame.functionName || '(anonymous)'} ${frame.url.split('/').slice(-1)[0]}:${frame.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + profile.timeDeltas[index] / 1000);
  });
  const report = { phase, results, topCpu: [...self].sort((a, b) => b[1] - a[1]).slice(0, 15) };
  await fs.mkdir('output/playwright/grade-performance', { recursive: true });
  await fs.writeFile(`output/playwright/grade-performance/${phase}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
