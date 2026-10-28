const {test,expect}=require('@playwright/test');
const {startLab}=require('./lab-server.cjs');
let lab,base;
test.beforeAll(async()=>{lab=startLab('xss',['0']);[base]=await lab.ready});
test.afterAll(async()=>{if(lab)await lab.stop()});

const payload=`<img src=x onerror="document.getElementById('status').textContent='Script ran. It can read: '+document.cookie">`;
async function send(page,mode,name){
 await page.goto(base);
 await page.getByLabel('Implementation').selectOption(mode);
 await page.getByLabel('Your name').fill(name);
 await page.getByRole('button',{name:'Send request'}).click();
}

test('dogfood the real form: markup and script run only in vulnerable mode',async({page})=>{
 await send(page,'vulnerable','Sam');
 await expect(page.locator('#greeting')).toHaveText('Hello, Sam!');

 await send(page,'vulnerable','Use the <b> tag');
 await expect(page.locator('#greeting b')).toHaveCount(1);
 await send(page,'fixed','Use the <b> tag');
 await expect(page.locator('#greeting b')).toHaveCount(0);
 await expect(page.locator('#greeting')).toHaveText('Hello, Use the <b> tag!');

 await send(page,'vulnerable',payload);
 await expect(page.locator('#status')).toHaveText(/^Script ran\. It can read: .*cp_xss_demo=fictional-session-1234/);
 await expect(page.locator('#source')).toContainText('<img src=x onerror=');

 await send(page,'fixed',payload);
 await expect(page.locator('#greeting')).toHaveText('Hello, '+payload+'!');
 await page.waitForLoadState('load');
 await expect(page.locator('#status')).toHaveText('No script from your input has run.');
});
