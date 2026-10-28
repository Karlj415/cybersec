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
