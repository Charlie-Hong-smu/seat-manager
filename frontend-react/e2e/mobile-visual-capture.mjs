import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { classroomData } from './mobile-classroom-fixtures.ts';
import { openSeatTool } from './seatTools.ts';
const phase=process.env.CAPTURE_PHASE || 'after';
const origin=process.env.CAPTURE_ORIGIN || 'http://127.0.0.1:5194';
const browser=await chromium.launch({headless:true});
const createdAt='2026-10-01T00:00:00Z';
const data=classroomData();
const book={version:1,currentSliceId:'mobile',slices:[{id:'mobile',classId:'mobile',className:'合成手机测试班',term:{id:'term',year:2026,season:'autumn',label:'2026 秋',createdAt},createdAt,updatedAt:createdAt,data}]};
fs.mkdirSync('output/playwright/mobile-workflow',{recursive:true});
for(const width of (process.env.CAPTURE_WIDTHS || '360,390,430,1440').split(',').map(Number)){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},isMobile:width!==1440,hasTouch:width!==1440,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage();await page.addInitScript(book=>{if(!localStorage.getItem('seat-manager-workspaces-v1'))localStorage.setItem('seat-manager-workspaces-v1',JSON.stringify(book));},book);
 await page.goto(`${origin}/seat-manager/`);await page.getByRole('button',{name:'进入本地预览',exact:true}).click();await page.getByRole('heading',{name:'今日班务'}).waitFor();
 const nav=async name=>{if(width!==1440)await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:new RegExp('^'+name)}).click();await page.locator('.app-motion-switch[data-moving]').waitFor({state:'detached'});await page.waitForTimeout(450);};
 await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-today-${width}.png`});
 if(phase==='after'){
  await page.getByRole('button',{name:/查看全部/}).click();
  await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-today-queue-${width}.png`});
  await page.keyboard.press('Escape');
 }
 await nav('座位');await page.getByRole('button',{name:'展开等待区'}).click();await page.waitForTimeout(400);console.log(width,'waiting',await page.locator('.seat-waiting-dock__list').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,touch:getComputedStyle(e.firstElementChild).touchAction})));await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-waiting-${width}.png`});
 if(phase==='after'){
  await page.getByRole('button',{name:'课堂记录',exact:true}).click();
  await page.locator('[data-seat-board-layer] [data-student-id="s0"]').click();
  await page.getByRole('complementary',{name:'课堂记录',exact:true}).getByRole('button',{name:'主动回答',exact:true}).click();
  await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-quick-record-${width}.png`});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'结束课堂记录',exact:true}).click();
  await openSeatTool(page,'编辑布局');
  await page.getByRole('button',{name:'选择座位',exact:true}).click();
  for(const column of [1,2]) await page.getByRole('button',{name:`第 1 行第 ${column} 列，已启用`,exact:true}).click();
  await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-layout-${width}.png`});
  await page.getByRole('button',{name:'取消',exact:true}).click();
 }
 await nav('出勤');await page.getByRole('button',{name:'详细',exact:true}).click();await page.locator('[data-attendance-student-id]').first().scrollIntoViewIfNeeded();console.log(width,'attendance',await page.locator('[data-attendance-student-id]').first().evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth})));await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-attendance-${width}.png`});
 await nav('成绩');await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-grades-${width}.png`});await page.locator('.grade-main-chart').scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-grades-chart-${width}.png`});if(width!==1440)await page.getByRole('button',{name:'考试与导入',exact:true}).click();await page.getByRole('button',{name:'查看成绩表格'}).first().click();await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-exam-${width}.png`});await page.keyboard.press('Escape');await nav('班费');await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-fund-top-${width}.png`});await page.getByRole('button',{name:'登记汇总',exact:true}).click();await page.getByText('合成长姓名测试同学甲',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-fund-${width}.png`});
 await nav('名单 / 备份');await page.locator('input[type=file]').first().setInputFiles({name:'合成名单.csv',mimeType:'text/csv',buffer:Buffer.from('姓名,学号,性别\n合成学生1,001,男\n合成学生2,002,女')});await page.getByRole('button',{name:/映射设置/}).click();await page.getByRole('dialog',{name:'名单列映射'}).waitFor();console.log(width,'mapping',await page.getByText('表格预览',{exact:true}).locator('..').locator('..').locator('..').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth})));await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-mapping-${width}.png`});await page.keyboard.press('Escape');
 await nav('任务与作业');await page.getByRole('tab',{name:'作业',exact:true}).click();console.log(width,'homeworkY',(await page.locator('[data-homework-student-id]').first().boundingBox()).y);await page.screenshot({path:`output/playwright/mobile-workflow/${phase}-homework-${width}.png`});
 await context.close();
}
await browser.close();
