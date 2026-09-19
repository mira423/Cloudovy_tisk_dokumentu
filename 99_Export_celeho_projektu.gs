// =========================================================================
// MODUL 99: EXPORT CELÉHO PROJEKTU (KÓDY I VLASTNOSTI V HLAVNÍ SLOŽCE I ARCHIVU)
// =========================================================================

const NAZEV_HLAVNI_SLOZKY = "Google Scripts";
const NAZEV_PODSLOZKY_EXPORT = "Export_kodu_pro_Gemini";
const NAZEV_PROJEKTU = "Cloudovy_tisk_dokumentu";
const NAZEV_SLOZKY_ZALOHA = "Zaloha"; // Složka pro staré zálohy

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
  const slozkaProjektu = ziskejNeboVytvorSlozku(slozkaExportu, NAZEV_PROJEKTU); // Hlavní složka projektu
  const slozkaZaloha = ziskejNeboVytvorSlozku(slozkaProjektu, NAZEV_SLOZKY_ZALOHA); // Podsložka "Zaloha"
  
  // Vytvoření dnešní datované podsložky pro historický archiv (uvnitř složky "Zaloha")
  const nazevDnesniZalohy = `${NAZEV_PROJEKTU}_${Utilities.formatDate(new Date(), "Europe/Prague", "yyyy-MM-dd_HH-mm")}`;
  const dnesniSlozkaZalohy = slozkaZaloha.createFolder(nazevDnesniZalohy);

  Logger.log("📂 Vytvářím kompletní zálohu do: Zaloha/" + nazevDnesniZalohy);

  // 2. EXPORT SOUBORŮ KÓDU
  files.forEach(f => {
    if (!f.source) return;
    
    const hlavicka = `=== EXPORT SOUBORU: ${f.name} ===\nVygenerováno: ${Utilities.formatDate(new Date(), "Europe/Prague", "dd. MM. yyyy HH:mm")}\n\n`;
    const celyObsah = hlavicka + f.source;
    const nazevDokumentu = `${NAZEV_PROJEKTU}-${f.name}`;
    const nazevTxt = nazevDokumentu + ".txt";

    // a) Uložení jako Google Doc do DATOVANÉ podsložky (Archiv)
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

    // b) Uložení kopie (.txt) do DATOVANÉ podsložky (Archiv)
    dnesniSlozkaZalohy.createFile(nazevTxt, celyObsah, MimeType.PLAIN_TEXT);

    // c) Uložení nebo přepsání nejnovějšího (.txt) PŘÍMO V HLAVNÍ SLOŽCE
    const existujiciTxt = slozkaProjektu.getFilesByName(nazevTxt);
    if (existujiciTxt.hasNext()) {
      existujiciTxt.next().setContent(celyObsah);
    } else {
      slozkaProjektu.createFile(nazevTxt, celyObsah, MimeType.PLAIN_TEXT);
    }
    
    Logger.log(`✅ Uložen kód: ${f.name}`);
  });

  // 3. EXPORT VLASTNOSTÍ SKRIPTU (Script Properties)
  const vlastnostiData = PropertiesService.getScriptProperties().getProperties();
  const nazevVlastnostiTxt = `${NAZEV_PROJEKTU}-Vlastnosti.txt`;
  const hlavickaVlastnosti = `=== VLASTNOSTI SKRIPTU (Script Properties) ===\nVygenerováno: ${Utilities.formatDate(new Date(), "Europe/Prague", "dd. MM. yyyy HH:mm")}\n\n`;
  const celyObsahVlastnosti = hlavickaVlastnosti + JSON.stringify(vlastnostiData, null, 2);

  // a) Uložení vlastností do archivu (Zaloha/...)
  dnesniSlozkaZalohy.createFile(nazevVlastnostiTxt, celyObsahVlastnosti, MimeType.PLAIN_TEXT);

  // b) Uložení nebo přepsání živého souboru vlastností v hlavní složce
  const existujiciVlastnostiTxt = slozkaProjektu.getFilesByName(nazevVlastnostiTxt);
  if (existujiciVlastnostiTxt.hasNext()) {
    existujiciVlastnostiTxt.next().setContent(celyObsahVlastnosti);
  } else {
    slozkaProjektu.createFile(nazevVlastnostiTxt, celyObsahVlastnosti, MimeType.PLAIN_TEXT);
  }

  Logger.log(`⚙️ Vyexportovány i vlastnosti skriptu (${nazevVlastnostiTxt}).`);
  Logger.log("🎉 ZÁLOHA BYLA ÚSPĚŠNĚ DOKONČENA!");
}

function ziskejNeboVytvorSlozku(rodicovskaSlozka, nazevSlozky) {
  const slozky = rodicovskaSlozka.getFoldersByName(nazevSlozky);
  if (slozky.hasNext()) {
    return slozky.next();
  } else {
    return rodicovskaSlozka.createFolder(nazevSlozky);
  }
}