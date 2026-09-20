/**
 * ==============================================================================
 * PROJEKT: Cloudový Tiskový Hlídač & Archivátor Faktur (Nody.cz)
 * VERZE: 6.4 (Přidáno Datum dokladu a úprava sloupců dle tabulky)
 * ==============================================================================
 */

function hlidacSlozkyProTisk() {
  var props = PropertiesService.getScriptProperties();
  var slozky = [
    { id: props.getProperty('CESTA_PRO_CLOUDTISK'), secure: false },
    { id: props.getProperty('CESTA_PRO_CLOUDTISK-SOUKROME'), secure: true }
  ];
  
  var jizHlaseno = JSON.parse(props.getProperty('NOTIFIKOVANE_SOUBORY') || "[]");
  var aktualniSouboryVCloudu = [];

  slozky.forEach(function(slozka) {
    if (!slozka.id) return;
    
    var files = Drive.Files.list({
      q: "'" + slozka.id + "' in parents and trashed = false",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id, name, mimeType)"
    });

    if (files.files) {
      files.files.forEach(function(f) {
        var id = f.id;
        var nazev = f.name;

        if (nazev.indexOf("SMAZAT_") === 0) {
          DriveApp.getFileById(id).setTrashed(true);
          return;
        }

        aktualniSouboryVCloudu.push(id);
        if (jizHlaseno.indexOf(id) !== -1) return;

        var pdfBlob = null;
        var zpracovatelnyBlob = null;
        
        try {
          var souborObj = DriveApp.getFileById(id);
          var mime = f.mimeType;

          if (mime.indexOf('officedocument') !== -1 || mime.indexOf('msword') !== -1 || mime.indexOf('excel') !== -1) {
            var targetMime = (mime.indexOf('sheet') !== -1) ? MimeType.GOOGLE_SHEETS : MimeType.GOOGLE_DOCS;
            var temp = Drive.Files.create({name: "TEMP_" + nazev, mimeType: targetMime}, souborObj.getBlob());
            pdfBlob = DriveApp.getFileById(temp.id).getBlob().getAs('application/pdf');
            Drive.Files.remove(temp.id);
            zpracovatelnyBlob = pdfBlob;
          } else if (mime === 'application/pdf') {
            pdfBlob = souborObj.getBlob();
            zpracovatelnyBlob = pdfBlob;
          } else if (mime.indexOf('image/') === 0) {
            zpracovatelnyBlob = souborObj.getBlob();
            pdfBlob = zpracovatelnyBlob.getAs('application/pdf');
          }

          if (pdfBlob) {
            var novyNazev = nazev.toLowerCase().endsWith(".pdf") ? nazev : nazev + ".pdf";
            
            if (!nazev.toLowerCase().endsWith(".pdf")) {
              var novePdf = DriveApp.getFolderById(slozka.id).createFile(pdfBlob).setName(novyNazev);
              souborObj.setTrashed(true);
              id = novePdf.getId();
              aktualniSouboryVCloudu.push(id);
            }

            // AI Analýza přes Gemini
            var archivovanoInfo = "";
            var aiVysledek = analyzujDokladPomociGemini(zpracovatelnyBlob);

            if (aiVysledek && aiVysledek.isInvoice) {
              var cestaFakturyRaw = props.getProperty('CESTA_PRO_FAKTURY');
              var cestaTabulkyRaw = props.getProperty('CESTA_TABULKY_FAKTUR');
              
              var folderId = ziskejIdSlozky(cestaFakturyRaw);
              var sheetId = ziskejIdTabulky(cestaTabulkyRaw);

              if (folderId) {
                var cilslozka = DriveApp.getFolderById(folderId);
                
                var pripona = ".pdf";
                if (mime.indexOf('image/jpeg') === 0) pripona = ".jpg";
                if (mime.indexOf('image/png') === 0) pripona = ".png";
                
                var novyNazevArchiv = aiVysledek.suggestedFilename + pripona;
                var archivniSoubor = cilslozka.createFile(zpracovatelnyBlob).setName(novyNazevArchiv);
                
                if (sheetId) {
                  zapisDoTabulkyFaktur(sheetId, aiVysledek, nazev, novyNazevArchiv, archivniSoubor.getUrl());
                }
                archivovanoInfo = "\n📂 <b>Archivováno:</b> <code>" + novyNazevArchiv + "</code>";
              }
            }

            posliTelegramDotazCloud(novyNazev, id, slozka.secure, archivovanoInfo);
            jizHlaseno.push(id);
          }
        } catch (e) { console.error("Chyba při zpracování: " + e); }
      });
    }
  });
  props.setProperty('NOTIFIKOVANE_SOUBORY', JSON.stringify(jizHlaseno.filter(id => aktualniSouboryVCloudu.includes(id))));
}

// =======================================================
// POMOCNÁ TESTOVACÍ FUNKCE
// =======================================================
function TEST_nacistModely() {
  CacheService.getScriptCache().remove("CENTRALNI_GEMINI_MODELY");
  var modely = nactiCentralniModely();
  console.log("Výsledek načtení modelů: " + JSON.stringify(modely));
}

// =======================================================
// MODUL: UMĚLÁ INTELIGENCE GEMINI A ARCHIVACE
// =======================================================

function analyzujDokladPomociGemini(blob) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  var modely = nactiCentralniModely();

  if (!apiKey) {
    console.error("Chybí GEMINI_API_KEY ve vlastnostech skriptu.");
    return null;
  }

  var base64Data = Utilities.base64Encode(blob.getBytes());
  var mimeType = blob.getContentType();

  var promptText = "Posouzej tento dokument. Zjisti, zda se jedná o fakturu nebo účtenku/daňový doklad.\n" +
    "Vrať odpověď výhradně jako JSON objekt bez Markdown formátování s následující strukturou (jen cisty text):\n" +
    "{\n" +
    '  "isInvoice": true/false,\n' +
    '  "type": "Faktura" nebo "Účtenka" nebo "Jiné",\n' +
    '  "issueDate": "Datum vystavení dokladu ve formátu DD.MM.YYYY (pokud ho nelze vyčíst, uveď Neuvedeno)",\n' +
    '  "vendor": "Název dodavatele/firmy",\n' +
    '  "description": "Stručný popis zboží/služby (max 4 slova)",\n' +
    '  "totalAmount": "Celková částka včetně DPH jako číslo",\n' +
    '  "currency": "Měna (např. CZK, EUR)",\n' +
    '  "suggestedFilename": "Sestavený název souboru ve tvaru: Typ_Dodavatel_StrucnyPopis (bez diakritiky, bez mezer, podtrzitka)"\n' +
    "}";

  var payload = {
    "contents": [{
      "parts": [
        { "inline_data": { "mime_type": mimeType, "data": base64Data } },
        { "text": promptText }
      ]
    }],
    "generationConfig": {
      "responseMimeType": "application/json",
      "temperature": 0.1
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  for (var i = 0; i < modely.length; i++) {
    var model = modely[i];
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey.trim();
    
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      var responseText = response.getContentText();

      if (code === 200) {
        var jsonResp = JSON.parse(responseText);
        if (jsonResp.candidates && jsonResp.candidates.length > 0) {
          var rawText = jsonResp.candidates[0].content.parts[0].text;
          rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
          return JSON.parse(rawText);
        }
      } else if (code === 503 || code === 429) {
        Utilities.sleep(3000);
      } else if (code === 404) {
        odesliAlertNeplatnyModel(model, responseText);
      }
    } catch (err) {
      console.warn("Chyba při volání modelu " + model + ": " + err);
    }
  }
  return null;
}

function nactiCentralniModely() {
  var cache = CacheService.getScriptCache();
  var vPameti = cache.get("CENTRALNI_GEMINI_MODELY");
  
  if (vPameti) {
    return JSON.parse(vPameti);
  }

  var props = PropertiesService.getScriptProperties();
  var cesta = props.getProperty('GEMINI_MODELY');
  
  var vychoziModely = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest"];
  
  if (!cesta) return vychoziModely;

  var sheetId = ziskejIdTabulky(cesta);

  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheets()[0];
    var lastRow = sheet.getLastRow();
    
    if (lastRow === 0) return vychoziModely;

    var values = sheet.getRange(1, 1, lastRow, 1).getValues();
    var seznam = values.map(function(row) { return row[0].toString().trim(); })
                       .filter(function(val) { return val.length > 0 && !val.startsWith("#"); });

    if (seznam.length > 0) {
      cache.put("CENTRALNI_GEMINI_MODELY", JSON.stringify(seznam), 21600); // 6 hodin
      console.log("📋 Úspěšně načteny modely z tabulky: " + JSON.stringify(seznam));
      return seznam;
    }
    return vychoziModely;
  } catch (e) {
    console.error("Chyba při načítání modelů z tabulky (ID: " + sheetId + "): " + e.message);
    return vychoziModely;
  }
}

function odesliAlertNeplatnyModel(nefunkcniModel, chybovaZprava) {
  var cache = CacheService.getScriptCache();
  if (cache.get("ALERT_SENT_" + nefunkcniModel)) return;
  
  var textZpravy = "🚨 *VAROVÁNÍ: AI MODEL NEFUNKČNÍ*\n\nModel `" + nefunkcniModel + "` v Hlídači Tisku vrátil chybu 404 (byl vyřazen). Zkontrolujte tabulku modelů.";
  
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_IDS').split(",")[0].trim();
  
  if (token && chatId) {
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      "method": "post", 
      "contentType": "application/json", 
      "payload": JSON.stringify({"chat_id": chatId, "text": textZpravy, "parse_mode": "Markdown"})
    });
  }
  cache.put("ALERT_SENT_" + nefunkcniModel, "true", 43200);
}

function zapisDoTabulkyFaktur(spreadsheetId, data, puvodniNazev, novyNazev, odkazNaSoubor) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getActiveSheet();
    var datumNahrani = Utilities.formatDate(new Date(), "Europe/Prague", "dd.MM.yyyy HH:mm");
    
    // Zápis přesně odpovídá sloupcům A až I na vašem snímku obrazovky
    sheet.appendRow([
      datumNahrani,               // Sloupec A: Datum nahrání
      data.issueDate || "-",     // Sloupec B: Datum dokladu
      data.vendor || "Neznámý",   // Sloupec C: Dodavatel
      data.description || "-",    // Sloupec D: Popis / Předmět
      data.totalAmount || 0,      // Sloupec E: Částka celkem
      data.currency || "CZK",     // Sloupec F: Měna
      puvodniNazev,              // Sloupec G: Původní název
      novyNazev,                 // Sloupec H: Nový název
      odkazNaSoubor              // Sloupec I: Odkaz na Disk
    ]);
  } catch (e) {
    console.error("Chyba při zápisu do tabulky faktur: " + e);
  }
}

// =======================================================
// POMOCNÉ FUNKCE
// =======================================================

function ziskejIdSlozky(cesta) {
  if (!cesta) return null;
  var str = cesta.trim();
  var urlMatch = str.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  return urlMatch ? urlMatch[1] : str;
}

function ziskejIdTabulky(cesta) {
  if (!cesta) return null;
  var str = cesta.trim();
  var urlMatch = str.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return urlMatch ? urlMatch[1] : str;
}

function posliTelegramDotazCloud(nazev, fileId, jeSoukromy, archivovanoInfo) {
  var props = PropertiesService.getScriptProperties();
  var prefix = jeSoukromy ? "SECURE_" : "";
  var ikona = jeSoukromy ? "🔴 🔐 <b>DŮVĚRNÉ:</b>" : "☁️ <b>Nový soubor:</b>";
  
  var textZpravy = ikona + "\n<code>" + nazev + "</code>" + (archivovanoInfo || "") + "\n\nVytisknout?";
  
  var payload = {
    "chat_id": props.getProperty('TELEGRAM_CHAT_IDS').split(",")[0].trim(),
    "text": textZpravy,
    "parse_mode": "HTML",
    "reply_markup": JSON.stringify({
      "inline_keyboard": [[
          { "text": "🖨️ TISKNOUT", "callback_data": prefix + "remote_" + fileId },
          { "text": "🗑️ SMAZAT", "callback_data": prefix + "delete_" + fileId }
      ]]
    })
  };
  UrlFetchApp.fetch("https://api.telegram.org/bot" + props.getProperty('TELEGRAM_TOKEN') + "/sendMessage", {
    "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload)
  });
}

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var action = e.parameter.action;
  
  if (action === "get_token") {
    return ContentService.createTextOutput(props.getProperty('TELEGRAM_TOKEN'));
  }
  
  if (action === "check_auth") {
    var userId = (e.parameter.user_id || "").toString().trim();
    var mojeId = (props.getProperty('TELEGRAM_ID_MOJE') || "").toString().trim();
    return ContentService.createTextOutput((userId === mojeId) ? "OK" : "DENIED");
  }
  
  if (e.parameter.id) {
    var file = DriveApp.getFileById(e.parameter.id);
    return ContentService.createTextOutput(JSON.stringify({ 
      blob: Utilities.base64Encode(file.getBlob().getBytes()), 
      name: file.getName() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput("Error");
}