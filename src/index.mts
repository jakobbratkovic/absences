import {chromium, LaunchOptions, Page} from 'playwright';

const url = 'https://myeeb1.13stars.eu/absences'

const options: LaunchOptions = {
    'headless': true
};

type TAbsence = {
    period: string,
    classes: string[]
};

function trimHTML(input: string): string {
    return input
        .replace(/^<td>/, '')
        .replace(/<\/td>$/, '');
}

function rowToAbsence(row: string): TAbsence {
    let period: string;
    let classes: string | string[];
    [period, classes] = row.split('</td><td>');
    classes = classes.split('<br>')
    return {
        period,
        classes
    }
}

async function generateAbsenceTable(page: Page): Promise<TAbsence[]> {
    let absenceTable: TAbsence[] = []
    absenceTable = await Promise.all((await page.$$('tbody tr:has(td)')).map(async (tr) => {
        let rowHTML = trimHTML(await tr.innerHTML());
        return rowToAbsence(rowHTML);
    }));

    return absenceTable;
}

(async () => {
    const browser = await chromium.launch(options);
    const page = await browser.newPage();
    await page.goto(url, {waitUntil: 'networkidle'});
    let absenceList = await generateAbsenceTable(page);
    await browser.close();
})();