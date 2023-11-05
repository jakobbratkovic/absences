import { chromium, LaunchOptions, Page } from 'playwright';
import fetch from 'node-fetch';
import config from './config.mjs';
import { JSDOM } from 'jsdom';
import {createHmac} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const url = 'https://myeeb1.13stars.eu/absences';

const options: LaunchOptions = {
    'headless': true
};

type TNotifyTag = {
    name: string,
    id: string
}

type TUser = {
    "name": string,
    "notify": TNotifyTag[],
    "classes": string[]
    "webhook": string
}

type TItem = {
    type: "TextBlock",
    text: string,
    wrap?: boolean,
    weight?: "Bolder"
}

type TCell = {
    type: "TableCell",
    style?: "good",
    items: TItem[]
}

type TRow = {
    type: "TableRow",
    cells: TCell[]
}

type TColumn = {
    width: number
}

type TTable = {
    type: "Table",
    firstRowAsHeaders: boolean,
    columns: TColumn[],
    rows: TRow[]
}

type TMenitionEntity = {
    "type": "mention",
    "text": string,
    "mentioned": {
        "id": string,
        "name": string
    }
}

type TMentionTextBlock = {
    "type": "TextBlock",
    "text": string
}

function trimHTML(input: string): string {
    return input
        .replace(/^<td>/, '')
        .replace(/<\/td>$/, '');
}

function rowToAbsence(period: string, missingClass: string): TRow {
    let tableRow: TRow = {
        type: "TableRow",
        cells: [
            {
                type: "TableCell",
                items: [
                    {
                        type: "TextBlock",
                        text: period
                    }
                ]
            },
            {
                type: "TableCell",
                items: [
                    {
                        type: "TextBlock",
                        text: missingClass
                    }
                ]
            }
        ]
    }

    return tableRow;
}

async function fetchAbsencePage(): Promise<string | undefined> {
    const browser = await chromium.launch(options);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    let body = await page.content();
    await browser.close();
    return body;
}

function buildAbsenceTable(absenceRows: TRow[]): TTable {
    let absenceTable: TTable = {
        type: "Table",
        firstRowAsHeaders: true,
        columns: [
            {
                "width": 1
            },
            {
                "width": 3
            }
        ],
        rows: [
            {
                type: "TableRow",
                cells: [
                    {
                        type: "TableCell",
                        items: [
                            {
                                type: "TextBlock",
                                text: "Period"
                            }
                        ]
                    },
                    {
                        type: "TableCell",
                        items: [
                            {
                                type: "TextBlock",
                                text: "Class"
                            }
                        ]
                    }
                ]
            }
        ]
    }

    absenceTable.rows = absenceTable.rows.concat(absenceRows);
    return absenceTable;
}

function buildMentionBlock(user: TUser): TMentionTextBlock {
    let mentionText: string = `Beep boop, I'm a robot:`;

    user.notify.forEach((notify) => {
        mentionText += ` <at>${notify.name}</at>`
    });

    return {
        "type": "TextBlock",
        "text": `${mentionText}`
    }
}

function buildMentionEntity(user: TUser): TMenitionEntity[] {
    let entities: TMenitionEntity[] = [];
    user.notify.forEach(notify => {
        entities.push(
            {
                "type": "mention",
                "text": `<at>${notify.name}</at>`,
                "mentioned": {
                    "id": notify.id,
                    "name": notify.name
                }
            }
        )
    });
    return entities;
}

async function postAbsenceTable(mentionTextBlock: TMentionTextBlock, table: TTable, mentionEntities: TMenitionEntity[], webhookURL: string) {
    let body = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "type": "AdaptiveCard",
                    "body": [
                        mentionTextBlock,
                        table
                    ],
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "version": "1.6",
                    "msteams": {
                        "entities": mentionEntities
                    }
                }
            }
        ]
    }

    const response = await fetch(webhookURL, {
        method: 'post',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
    });
    return response;
}

function extractPeriodFromRow(row: Element): string | undefined {
    return row.querySelector('td')?.innerHTML;
}

function extractMissingClassFromRow(row: Element, usersClasses: string[]): string | undefined {
    let missingClass: string | undefined = undefined;
    try {
        let classes = (row.querySelectorAll('td')[1]).innerHTML.split('<br>');
        classes.forEach(className => {
            if (usersClasses.includes(className)) missingClass = className;
        });
    } catch {
        return undefined;
    }
    return missingClass;
}

function isValidDate(infoString: string): boolean {
    let today = new Date();
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    let date: Date;
    (today.getHours() < 16) ? date = today : date = tomorrow;
    let dateString = date.toLocaleDateString("en-GB");
    console.log(`Running for info string ${infoString}`)
    console.log(`Comparing with date ${dateString}`)
    if(infoString.includes(dateString)) {
        return true;
    } else {
        return false;
    } return false;
}

function isAlreadyPublished(user: string, absenceTable: TTable): boolean {
    const hash = createHmac('sha256', JSON.stringify(absenceTable))
               .digest('hex');
    const path = `/tmp/${user}.hash`

    try {
        let storedHash = readFileSync(path, {encoding:'utf8'});
        if(storedHash === hash) return true;
    } catch {}
    writeFileSync(path, hash, {encoding: 'utf8'})
    return false;
}

(async () => {
    let page = await fetchAbsencePage();
    const dom = new JSDOM(page);
    let infoString: string | undefined = dom.window.document.querySelector('#info')?.innerHTML;
    if(infoString && !isValidDate(infoString)) {
        console.log('Absence table has a wrong date, bailing out!');
        process.exit(0);
    }

    config.users.forEach(user => {
        console.log(`Parsing absences for: ${user.name}`);
        let tableRowArray: TRow[] = [];
        dom.window.document.querySelectorAll('table tr:has(td)').forEach((row) => {
            let period = extractPeriodFromRow(row);
            let missingClass = extractMissingClassFromRow(row, user.classes);
            if (missingClass && period) {
                tableRowArray.push(rowToAbsence(period, missingClass));
            }
        });
        let absenceTable: TTable = buildAbsenceTable(tableRowArray);
        if(!isAlreadyPublished(user.name, absenceTable)) {
            console.log('Publishing new absence table');
            postAbsenceTable(buildMentionBlock(user), absenceTable, buildMentionEntity(user), user.webhook);
        }
    });
})();