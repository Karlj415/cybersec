const {test,expect}=require('@playwright/test');
const {startLab}=require('./lab-server.cjs');
let lab,shop,attacker;
test.beforeEach(async()=>{lab=startLab('access-control',['0','0'],2);[shop,attacker]=await lab.ready});
test.afterEach(async()=>{if(lab)await lab.stop()});

async function signInAsAlice(page){
 await page.goto(shop);
 await page.getByRole('button',{name:'Sign in as Alice'}).click();
 await expect(page.locator('#who')).toHaveText('Signed in as Alice.');
}

test('IDOR: changing the invoice number leaks only in vulnerable mode',async({page})=>{
 await signInAsAlice(page);
 await page.getByRole('link',{name:'Open invoice 1041 (vulnerable)'}).click();
 await expect(page.locator('#owner')).toHaveText('alice');
 await page.goto(shop+'/vulnerable/invoices/1042');
 await expect(page.locator('#owner')).toHaveText('bob');
 const fixed=await page.goto(shop+'/fixed/invoices/1042');
 expect(fixed.status()).toBe(404);
 await expect(page.locator('body')).not.toContainText('headphones');
 await page.goto(shop+'/fixed/invoices/1041');
 await expect(page.locator('#owner')).toHaveText('alice');
});

test('CSRF from a same-site page: the token stops it, the cookie alone does not',async({page})=>{
 await signInAsAlice(page);
 await page.getByLabel('New email').last().fill('alice.new@example.invalid');
 await page.getByRole('button',{name:'Save (fixed)'}).click();
 await expect(page.locator('#message')).toContainText('is now alice.new@example.invalid');

 await page.goto(attacker);
 await page.getByRole('button',{name:'Claim prize (fixed target)'}).click();
 await expect(page.locator('#message')).toHaveText(/missing or wrong CSRF token/);
 await page.goto(shop);
 await expect(page.locator('#email')).toHaveText('alice.new@example.invalid');

 await page.goto(attacker);
 await page.getByRole('button',{name:'Claim prize (vulnerable target)'}).click();
 await expect(page.locator('#message')).toHaveText('Recovery email for Alice is now attacker@example.invalid.');
 await page.goto(shop);
 await expect(page.locator('#email')).toHaveText('attacker@example.invalid');
});

test('CSRF from a different site: SameSite=Lax keeps the cookie off the forged form',async({page})=>{
 await signInAsAlice(page);
 await page.goto(attacker.replace('127.0.0.1','localhost'));
 await page.getByRole('button',{name:'Claim prize (vulnerable target)'}).click();
 await expect(page.locator('h1')).toHaveText('Not signed in');
 await page.goto(shop);
 await expect(page.locator('#email')).toHaveText('alice@example.invalid');
});
