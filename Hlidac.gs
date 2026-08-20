/**
 * ==============================================================================
 * PROJEKT: Cloudový Tiskový Hlídač (Nody.cz)
 * VERZE: 5.3 (Cloud Security & PDF Engine)
 * ÚČEL: Monitoruje Google Drive, převádí dokumenty a posílá dotazy na Telegram.
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
        try {
          var souborObj = DriveApp.getFileById(id);
          if (f.mimeType.indexOf('officedocument') !== -1 || f.mimeType.indexOf('msword') !== -1 || f.mimeType.indexOf('excel') !== -1) {
            var targetMime = (f.mimeType.indexOf('sheet') !== -1) ? MimeType.GOOGLE_SHEETS : MimeType.GOOGLE_DOCS;
            var temp = Drive.Files.create({name: "TEMP_" + nazev, mimeType: targetMime}, souborObj.getBlob());
            pdfBlob = DriveApp.getFileById(temp.id).getBlob().getAs('application/pdf');
            Drive.Files.remove(temp.id);
          } else if (f.mimeType === 'application/pdf') {
            pdfBlob = souborObj.getBlob();
          }

          if (pdfBlob) {
            var novyNazev = nazev.toLowerCase().endsWith(".pdf") ? nazev : nazev + ".pdf";
            if (!nazev.toLowerCase().endsWith(".pdf")) {
              var novePdf = DriveApp.getFolderById(slozka.id).createFile(pdfBlob).setName(novyNazev);
              souborObj.setTrashed(true);
              id = novePdf.getId();
              aktualniSouboryVCloudu.push(id);
            }
            posliTelegramDotazCloud(novyNazev, id, slozka.secure);
            jizHlaseno.push(id);
          }
        } catch (e) { console.error("Chyba: " + e); }
      });
    }
  });
  props.setProperty('NOTIFIKOVANE_SOUBORY', JSON.stringify(jizHlaseno.filter(id => aktualniSouboryVCloudu.includes(id))));
}

function posliTelegramDotazCloud(nazev, fileId, jeSoukromy) {
  var props = PropertiesService.getScriptProperties();
  var prefix = jeSoukromy ? "SECURE_" : "";
  var ikona = jeSoukromy ? "🔴 🔐 <b>DŮVĚRNÉ:</b>" : "☁️ <b>Nový soubor:</b>";
  var payload = {
    "chat_id": props.getProperty('TELEGRAM_CHAT_IDS').split(",")[0].trim(),
    "text": ikona + "\n<code>" + nazev + "</code>\n\nVytisknout?",
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