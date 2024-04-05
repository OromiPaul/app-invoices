require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const vision = require('@google-cloud/vision');
const { JWT } = require('google-auth-library');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

// Configure Google Drive API
const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/vision']
);

let docInitialized = false;
let doc;

async function configureGoogleSheets(){
    if(!docInitialized){
        console.log("Initializing Google Sheets...");
        await auth.authorize();
        doc = new GoogleSpreadsheet('1R5qFdJU0seaF6-_c6jtBe-O9wCKkxgsDENvHlGz7W3c', auth);
        await doc.loadInfo();
        console.log("Google Sheets initalized");
        docInitialized = true;
    }
};

const drive = google.drive({ version: 'v3', auth });

async function uploadFile(filePath) {
    await configureGoogleSheets();
    const response = await drive.files.create({
        requestBody: {
            name: path.basename(filePath),
            mimeType: 'image/jpeg',
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID], // ID of the folder where you want to upload the file
        },
        media: {
            mimeType: 'image/jpeg',
            body: fs.createReadStream(filePath),
        },
        fields: 'id',
    });

    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    const fileUrl = `https://drive.google.com/uc?id=${response.data.id}`;
    return fileUrl;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', '/form.html'));
});

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No image uploaded.');
    }

    try {
        // Upload the file to Google Drive
        await configureGoogleSheets();
        const fileUrl = await uploadFile(req.file.path);
        const now = new Date();
        const formattedDate = now.getDate() + "/" + (now.getMonth()+1) + "/" + now.getFullYear();
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow({
            Image: fileUrl,
            Context: req.body.context,
            Date: formattedDate
        })
        console.log("File uploaded to Google Drive at URL:", fileUrl);

        // You need to integrate the Google Sheets part here
        // For now, let's just return the Google Drive file URL

        res.send(`Invoice uploaded and available at: ${fileUrl}`);
    } catch (error) {
        console.error(error);
        res.status(500).send("Failed to upload invoice data.");
    }
});

configureGoogleSheets().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
})


