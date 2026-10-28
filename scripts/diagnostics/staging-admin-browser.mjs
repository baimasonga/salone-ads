import {chromium,expect} from '@playwright/test';
export async function openAdminBrowser(email,password){
 const browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.setDefaultTimeout(30000);
 try{
  await page.goto('https://manohub-staging-container.mohamedbangura.workers.dev/?auth=signin');
  await page.getByPlaceholder('name@salonemail.com').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByRole('button',{name:'Automated Subscription Billing',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Subscription Lifecycle',exact:true})).toBeVisible();
  console.log('PASS: real browser admin password sign-in and subscription navigation.');
  return {async review(reference,decision){
   await page.reload();
   await page.getByRole('button',{name:'Automated Subscription Billing',exact:true}).click();
   const card=page.locator('article').filter({hasText:reference});
   await expect(card).toBeVisible();
   if(decision==='rejected')page.once('dialog',dialog=>dialog.accept('[TEST] Synthetic staging browser rejection; no funds transferred.'));
   const response=page.waitForResponse(r=>r.url().endsWith('/rest/v1/rpc/review_subscription_payment')&&r.request().method()==='POST');
   await card.getByRole('button',{name:decision==='verified'?'Verify & activate':'Reject',exact:true}).click();
   const r=await response;
   if(!r.ok())throw new Error(`Browser review returned HTTP ${r.status()}`);
   await expect(page.getByText(new RegExp(`payment ${decision}; subscription ${decision==='verified'?'activated':'declined'}\\.`))).toBeVisible();
   await expect(card).toHaveCount(0);
   console.log(`PASS: browser ${decision} payment, success feedback and queue removal.`);
  },async close(){await context.close();await browser.close();}};
 }catch(e){await browser.close();throw e;}
}
