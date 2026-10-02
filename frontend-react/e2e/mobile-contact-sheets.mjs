import { chromium } from '@playwright/test';
import fs from 'node:fs';
const root='output/playwright/mobile-workflow';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:920,height:900},deviceScaleFactor:1});
for(const [key,label,widths] of [['waiting','等待区',[360,390,430]],['homework','作业登记',[360,390,430]],['fund','班费登记汇总',[360,390,430]],['grades','成绩首屏',[360,390,430]],['exam','考试表格',[360,390,430]],['mapping','名单列映射',[360,390,430]],['attendance','出勤详情',[360]],['today','今日队列',[360,390,430]]]){
 const rows=widths.map(width=>`<section><div class="labels"><span>${width}px · 改前</span><span>${width}px · 改后</span></div><div class="images">${['before','after'].map(phase=>`<div><img width="${width}" src="data:image/png;base64,${fs.readFileSync(`${root}/${phase}-${key}-${width}.png`).toString('base64')}"></div>`).join('')}</div></section>`).join('');
 await page.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#f2f4f7;font:16px system-ui;color:#17202b}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 18px;color:#465365}.labels,.images{display:grid;grid-template-columns:430px 430px;gap:20px}.labels{margin:12px 0 8px;color:#465365}img{display:block;height:auto}.images>div{display:flex;justify-content:center}section{margin-bottom:20px}</style><h1>${label} · Chromium 手机仿真</h1><p>改前：549226d　|　改后：本地未提交修复分支</p>${rows}</html>`);
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:`${root}/compare-${key}.png`,fullPage:true});
}
await page.setViewportSize({width:1370,height:900});
for(const [key,label] of [['quick-record','座位 → 课堂记录'],['layout','布局纯点选'],['today-queue','全部待处理与业务直达']]){
 const columns=[360,390,430].map(width=>`<section><p>${width}px</p><img width="${width}" src="data:image/png;base64,${fs.readFileSync(`${root}/after-${key}-${width}.png`).toString('base64')}"></section>`).join('');
 await page.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#f2f4f7;font:16px system-ui;color:#17202b}h1{font-size:24px;margin:0 0 8px}p{color:#465365}.frames{display:grid;grid-template-columns:repeat(3,430px);gap:20px}section p{text-align:center}img{display:block;margin:auto}</style><h1>${label} · Chromium 手机仿真</h1><p>合成数据 · 本地未提交修复分支 · 明确保存前不写学生记录</p><div class="frames">${columns}</div></html>`);
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:`${root}/workflow-${key}.png`,fullPage:true});
}
await browser.close();
console.log('Created 8 comparison sheets and 3 workflow sheets.');
