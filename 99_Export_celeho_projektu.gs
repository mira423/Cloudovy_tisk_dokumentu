// =========================================================================
// MODUL 99: EXPORT CELÉHO PROJEKTU (S TXT V HLAVNÍ SLOŽCE)
// =========================================================================

const NAZEV_HLAVNI_SLOZKY = "Google Scripts";
const NAZEV_PODSLOZKY_EXPORT = "Export_kodu_pro_Gemini";
const NAZEV_PROJEKTU = "Cloudovy_tisk_dokumentu";

function exportujCelyProjektDoDocu() {
  const scriptId = ScriptApp.getScriptId();
  const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
  let response;
  
  try {
    response = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error("HTTP " + response.getResponseCode());
    }
  } catch (err) {
    Logger.log("❌ CHYBA API! Zkontroluj appsscript.json (oauthScopes). Detail: " + err.message);
    return;
  }
  
  const projectData = JSON.parse(response.getContentText());
  const files = projectData.files;
  
  // 1. Zajištění stromu složek na Disku
  const hlavniSlozka = ziskejNeboVytvorSlozku(DriveApp.getRootFolder(), NAZEV_HLAVNI_SLOZKY);
  const slozkaExportu = ziskejNeboVytvorSlozku(hlavniSlozka, NAZEV_PODSLOZKY_EXPORT);
  const slozkaProjektu = ziskejNeboVytvorSlozku(slozkaExportu, NAZEV_PROJEKTU); // Hlavní složka "AI_Postak"
  
  // Vytvoření dnešní datované podsložky pro historický archiv
  const nazevDnesniZalohy = `${NAZEV_PROJEKTU}_${Utilities.formatDate(new Date(), "Europe/Prague", "yyyy-MM-dd_HH-mm")}`;
  const dnesniSlozkaZalohy = slozkaProjektu.createFolder(nazevDnesniZalohy);

  Logger.log("📂 Vytvářím kompletní zálohu do: " + nazevDnesniZalohy);

  files.forEach(f => {
    if (!f.source) return;
    
    const hlavicka = `=== EXPORT SOUBORU: ${f.name} ===\nVygenerováno: ${Utilities.formatDate(new Date(), "Europe/Prague", "dd. MM. yyyy HH:mm")}\n\n`;
    const celyObsah = hlavicka + f.source;
    const nazevDokumentu = `${NAZEV_PROJEKTU}-${f.name}`;
    const nazevTxt = nazevDokumentu + ".txt";

    // a) Uložení jako Google Doc (přesuneme do datované podsložky)
    const doc = DocumentApp.create(nazevDokumentu);
    const textElement = doc.getBody().editAsText();
    textElement.setText(""); 
    
    const chunks = celyObsah.match(/[\s\S]{1,8000}/g) || [];
    chunks.forEach(chunk => {
      textElement.appendText(chunk);
    });
    doc.saveAndClose();
    
    const docFile = DriveApp.getFileById(doc.getId());
    docFile.moveTo(dnesniSlozkaZalohy);

    // b) Uložení 100% bezpečné kopie (.txt) do DATOVANÉ podsložky (Archiv)
    dnesniSlozkaZalohy.createFile(nazevTxt, celyObsah, MimeType.PLAIN_TEXT);

    // c) Uložení nebo přepsání nejnovějšího (.txt) PŘÍMO V HLAVNÍ SLOŽCE (Pro rychlý přístup)
    const existujiciTxt = slozkaProjektu.getFilesByName(nazevTxt);
    if (existujiciTxt.hasNext()) {
      // Pokud soubor už v hlavní složce existuje, jen mu aktualizujeme obsah
      existujiciTxt.next().setContent(celyObsah);
    } else {
      // Pokud tam ještě není, vytvoříme ho
      slozkaProjektu.createFile(nazevTxt, celyObsah, MimeType.PLAIN_TEXT);
    }
    
    Logger.log(`✅ Uložen komplet celý soubor: ${f.name}`);
  });
  
  Logger.log("🎉 ZÁLOHA BYLA ÚSPĚŠNĚ DOKONČENA! Živé .txt kódy najdeš v hlavní složce.");
}

function ziskejNeboVytvorSlozku(rodicovskaSlozka, nazevSlozky) {
  const slozky = rodicovskaSlozka.getFoldersByName(nazevSlozky);
  if (slozky.hasNext()) {
    return slozky.next();
  } else {
    return rodicovskaSlozka.createFolder(nazevSlozky);
  }
}


function importProperties() {
  // Sem vložte zkopírovaný JSON z protokolu (Loggeru)
  const dataToImport = {
  "nody-EUR-FIO_LAST_STAZENO_INFO": "2026-42",
  "NORMSERVIS-CZK-Sporici-FIO_Email": "info@normservis.cz",
  "NORMSERVIS-CZK-FIO_LAST_STAZENO_INFO": "2026-2",
  "CESTA_PRO_CLOUDTISK-SOUKROME": "1Pb4eHw9wd-lOFE2VAJzh7BA_VZw8558N",
  "TELEGRAM_CHAT_IDS": "-5140434268",
  "nody-EUR-FIO_TOKEN": "bniwIa5KZSoOmVCPIwwTgYYRa9LaSI9mTWXyzYWcMHSas6FSNiPBfHPLeEL3gpuu",
  "NORMSERVIS-CZK-FIO_PATH": "MIRA/Firemni/MojeBanka/VypisySRO/Fio/CZK",
  "nody-CZK-FIO_PATH": "MIRA/Firemni/MojeBanka/VypisySRO/Fio/nody - CZK",
  "NORMSERVIS-EUR-FIO_LAST_STAZENO_INFO": "2026-159",
  "nody-EUR-FIO_Email": "neposilat",
  "MUJ_EMAIL": "info@normservis.cz",
  "NORMSERVIS-CZK-Sporici-FIO_TOKEN": "Zldlb8HTKe5IlG2KqHcDxJJMgceICW2Dc8ZgUV1Ew9H1OBxNMmSWEwXqbv9l1N3N",
  "nody-CZK-FIO_Email": "neposilat",
  "nody-EUR-FIO_PATH": "MIRA/Firemni/MojeBanka/VypisySRO/Fio/nody - EUR",
  "NORMSERVIS-CZK-FIO_TOKEN": "vPlMj5ijNsCT0AfLn0Pf82zrtEG0dKU3WI4uVcrzm8MQtJ7IOCJEwjJCYKQ5WBZI",
  "NORMSERVIS-CZK-Sporici-FIO_LAST_STAZENO_INFO": "2026-10",
  "UCTY_K_TISKU": "NORMSERVIS-EUR, nody-CZK, nody-EUR",
  "NORMSERVIS-CZK-FIO_Email": "info@normservis.cz",
  "CESTA_PRO_CLOUDTISK": "1IUPOLVGAsTYeoe4K8rq9LbCRYAdW74PJ",
  "TELEGRAM_ID_MOJE": "1438171307",
  "NOTIFIKOVANE_SOUBORY": "[]",
  "TELEGRAM_TOKEN": "8786859605:AAGzUixqC23aOQ5QjawVPteB9SjEpDoDf4w",
  "nody-CZK-FIO_LAST_STAZENO_INFO": "2026-181",
  "NORMSERVIS-CZK-Sporici-FIO_PATH": "MIRA/Firemni/MojeBanka/VypisySRO/Fio/CZK-sporici",
  "NORMSERVIS-EUR-FIO_TOKEN": "P9lZcw7ooRMp4GjISleft4ikgT3CZmfbwXFxJQAMfKaGf5yM2d0GAxxuRKGn8FGK",
  "NORMSERVIS-EUR-FIO_Email": "neposilat",
  "NORMSERVIS-EUR-FIO_PATH": "MIRA/Firemni/MojeBanka/VypisySRO/Fio/EUR",
  "nody-CZK-FIO_TOKEN": "iuofMlpvKn914wW2JtRRvuLIkEuq1zF5MxCpvGpYBHZTNW3C79XJtXkX2YryKSkt"
};

  // Druhý parametr 'false' zachová případné stávající vlastnosti a pouze přidá/přepíše nové.
  // Pokud chcete všechny staré vlastnosti smazat a nahradit je, změňte 'false' na 'true'.
  PropertiesService.getScriptProperties().setProperties(dataToImport, false);
  
  Logger.log("Vlastnosti byly úspěšně importovány!");
}