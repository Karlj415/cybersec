const {test,expect}=require('@playwright/test');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const url=pathToFileURL(path.join(__dirname,'../index.html')).href;
test('mobile lesson layout, keyboard focus, search and saved answers',async({page})=>{
 await page.setViewportSize({width:320,height:740});
 await page.route('https://**/*',route=>route.abort());
 await page.goto(url);
 await page.getByRole('searchbox').fill('csrf');
 // The SQL lesson points forward to CSRF; the access-control lesson teaches it.
 await expect(page.locator('.lesson-card')).toHaveCount(2);
 await expect(page.locator('.lesson-card').nth(1)).toContainText('IDOR and CSRF');
 await page.locator('.lesson-card').filter({hasText:'SQL injection'}).click();
 await expect(page.locator('#lessonTitle')).toBeFocused();
 await expect(page.locator('.video-thumbnail')).toBeVisible();
 await expect(page.locator('.lab-step')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#quizBox input').first().focus();
 await page.keyboard.press('Space');
 await expect(page.locator('#quizBox input').first()).toBeChecked();
 await page.getByRole('button',{name:'Roadmap',exact:true}).click();
 await expect(page.locator('#homeTitle')).toBeFocused();
 await page.getByRole('button',{name:'Continue ▶',exact:true}).click();
 await expect(page.locator('#quizBox input').first()).toBeChecked();
 await page.reload();
 await page.getByRole('button',{name:'Continue ▶',exact:true}).click();
 await expect(page.locator('#quizBox input').first()).toBeChecked();
});
test('all lessons render without horizontal overflow at mobile and desktop widths',async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await page.goto(url);
 for(const width of [320,1280]){
  await page.setViewportSize({width,height:800});
  const ids=await page.evaluate(()=>ALL.map(l=>l.id));
  for(const id of ids){
   await page.evaluate(id=>openLesson(id),id);
   await expect(page.locator('.lab-step')).toHaveCount(3);
   await expect(page.locator('.quiz-q')).toHaveCount(3);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`lesson ${id} at ${width}px`).toBe(true);
  }
 }
});

test('prerequisite links open the JavaScript bridge and Windows reading route',async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await page.goto(url);
 await page.evaluate(()=>openLesson('l32'));
 await page.getByRole('button',{name:/Read the JavaScript before the SQL lab/}).click();
 await expect(page.locator('#lessonTitle')).toContainText('Read the JavaScript');
 await expect(page.getByText('Guided reading and code lab:',{exact:true})).toBeVisible();
 await page.evaluate(()=>openLesson('l59'));
 await page.getByRole('button',{name:/NTFS permissions/}).click();
 await expect(page.locator('#lessonTitle')).toContainText('NTFS permissions');
});

test('lessons have addresses: deep links, Back to the same roadmap position, and Forward',async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await page.goto(url+'#l60');
 await expect(page.locator('#lessonTitle')).toContainText('JavaScript from zero, part 1');
 await page.goto(url);
 await page.setViewportSize({width:1280,height:700});
 const card=page.locator('.lesson-card').nth(30);
 await card.scrollIntoViewIfNeeded();
 const y=await page.evaluate(()=>scrollY);
 expect(y).toBeGreaterThan(500);
 await card.click();
 await expect(page.locator('#lessonTitle')).toBeFocused();
 const lesson=await page.evaluate(()=>location.hash);
 // A sync redraw re-renders the lesson without adding a history entry.
 const entries=await page.evaluate(()=>history.length);
 await page.evaluate(()=>refreshView());
 expect(await page.evaluate(()=>history.length)).toBe(entries);
 await page.goBack();
 await expect(page.locator('#homeView')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(y);
 await page.goForward();
 await expect(page.locator('#lessonView')).toBeVisible();
 expect(await page.evaluate(()=>location.hash)).toBe(lesson);
});

test('headings never skip a level, on the roadmap or in any lesson',async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await page.goto(url);
 const skips=()=>page.evaluate(()=>{
  const levels=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h=>h.offsetParent!==null).map(h=>Number(h.tagName[1]));
  const bad=[];if(levels[0]!==1)bad.push('first heading is h'+levels[0]);
  levels.forEach((level,i)=>{if(i&&level>levels[i-1]+1)bad.push(`h${levels[i-1]} then h${level}`)});
  return bad;
 });
 expect(await skips(),'roadmap').toEqual([]);
 for(const id of await page.evaluate(()=>ALL.map(l=>l.id))){
  await page.evaluate(id=>openLesson(id),id);
  expect(await skips(),id).toEqual([]);
 }
});

test('skip link and a narrow screen: nothing in the menu is cut off',async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await page.setViewportSize({width:320,height:740});
 await page.goto(url);
 await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page.locator('#main')).toBeFocused();
 expect(await page.evaluate(()=>location.hash)).toBe('');
 const clipped=await page.evaluate(()=>[...document.querySelectorAll('.nav button')].filter(b=>b.scrollWidth>b.clientWidth||b.scrollHeight>b.clientHeight).map(b=>b.textContent));
 expect(clipped).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
