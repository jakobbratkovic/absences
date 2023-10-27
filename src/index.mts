import {chromium, LaunchOptions, Page} from 'playwright';

const url = 'https://myeeb1.13stars.eu/absences'

const options: LaunchOptions = {
    'headless': true
};

type TAbsence = {
    period: string,
    classes: string[]
};

async function generateAbsenceTable(page: Page): Promise<TAbsence[]> {
    let absenceTable: TAbsence[] = []
    absenceTable = await Promise.all((await page.$$('tbody tr:has(td)')).map(async (tr) => {
         let rowHTML = (await tr.innerHTML())
            .replace(/^<td>/, '')
            .replace(/<\/td>$/, '');
         let [period, classes] = rowHTML.split('</td><td>');
         let classesArray: string[];
         try {
            classesArray = classes.split('<br>')
         } catch {
            classesArray = []
         }

         return {
            period,
            classes: classesArray
         }
    }));

    return absenceTable;
}

(async () => {
    const browser = await chromium.launch(options);
    const page = await browser.newPage();
    await page.goto(url, {waitUntil: 'networkidle'});
    await generateAbsenceTable(page);
    await browser.close();
})();