// Imports for the generate thumbnail
const {Storage} = require('@google-cloud/storage')
const path = require('path')
const fs = require('fs-extra')
const os = require('os')
const sharp = require('sharp')

// Imports for the export of GPS data
const getExif = require('exif-async');
const parseDMS = require('parse-dms');

// Import for firebase
const {Firestore} = require('@google-cloud/firestore');
const { write } = require('fs')




// Entry point function
exports.generateThumbnail = async (file, context) => {
const gcsFile = file;
const storage = new Storage();
const sourceBucket = storage.bucket(gcsFile.bucket);
const thumbnailsBucket = storage.bucket('sp24-41200-rglopez-gj-thumbnails');
const finalBucket = storage.bucket('sp24-41200-rglopez-gj-final');

// url links for image buckets
let thumb64_url = '';
let finalURL = '';
let gpsDecimal = null;
  
//HINT HINT HINT
const version = process.env.K_REVISION;
console.log(`Running Cloud Function Version ${version}`);
  
// not needed
// console.log(`File Name: ${gcsFile.name}`);
// console.log(`Generator Number: ${gcsFile.generation}`);
// console.log(`Content Type: ${gcsFile.contentType}`);
  
// Reject images that are not jpeg or png files
let fileExtension = '';
let validFile = false;
    
if (gcsFile.contentType === 'image/jpeg') {
    console.log('This is a JPG file.');
    fileExtension = 'jpg';
    validFile = true;
} else if (gcsFile.contentType === 'image/png') {
    console.log('This is a PNG file.');
    fileExtension = 'png';
    validFile = true;
  } else {
      console.log('This is not a valid file.');
}
  
// If the file is a valid photograph, download it to the 'local' VM so that we can create a thumbnail image
if (validFile) {
    // Create a new filename for the 'final' version of the image file
    // The value of this will be something like '12745649237578595.jpg'
    const finalFileName = `${gcsFile.generation}.${fileExtension}`;
  
    // Create a working directory on the VM that runs our GCF to download the original file
    // The value of this variable will be something like 'tmp/thumbs'
    const workingDir = path.join(os.tmpdir(), 'thumbs');
  
    // Create a variable that holds the path to the 'local' version of the file
    // The value of this will be something like 'tmp/thumbs/398575858493.png'
    const tempFilePath = path.join(workingDir, finalFileName);
  
    // Wait until the working directory is ready
    await fs.ensureDir(workingDir);
  
    // Download the original file to the path on the 'local' VM
    await sourceBucket.file(gcsFile.name).download({
        destination: tempFilePath
    });
  
    // Upload our local version of the file to the final images bucket
    await finalBucket.upload(tempFilePath);




    //send the image to the extractExif function
    gpsDecimal = await extractExif(tempFilePath);
  


    // Create a name for the thumbnail image
    // The value for this will be something like `thumb@64_1234567891234567.jpg`
    const thumbName = `thumb@64_${finalFileName}`;
  
    // Create a path where we will store the thumbnail image locally
    // This will be something like `tmp/thumbs/thumb@64_1234567891234567.jpg`
    const thumbPath = path.join(workingDir, thumbName);
  
    // Use the sharp library to generate the thumbnail image and save it to the thumbPath
    // Then upload the thumbnail to the thumbnailsBucket in cloud storage
    await sharp(tempFilePath).resize(64).withMetadata().toFile(thumbPath).then(async () => {
        await thumbnailsBucket.upload(thumbPath);
    })


    thumb64_url = `https://storage.googleapis.com/sp24-41200-rglopez-gj-thumbnails/${thumbName}`;
    finalURL = `https://storage.googleapis.com/sp24-41200-rglopez-gj-final/${finalFileName}`;

    // Delete the temp working directory and its files from the GCF's VM
    await fs.remove(workingDir);
} 
    // end of validFile==true

    // DELETE the original file uploaded to the "Uploads" bucket
    await sourceBucket.file(gcsFile.name).delete();
    console.log(`Deleted uploaded file: ${gcsFile.name}`);


    // call writeFS function with urls and coords
    await writeToFS(gpsDecimal, thumb64_url, finalURL);

}



// Entry Point Function for grabbing coordinates
async function extractExif(imagePath) {
    let gpsObject = await readExifData(imagePath);
    console.log(gpsObject);

    let gpsDecimal = getGPSCoordinates(gpsObject);
    console.log(gpsDecimal);
    console.log(gpsDecimal.lat)
    console.log(gpsDecimal.lon);

    //returning the coordinates
    return gpsDecimal;
}


// Helper Functions
async function readExifData(localFile) {
    let exifData;

    try {
        exifData = await getExif(localFile);
        // console.log(exifData);
        // console.log(exifData.gps);
        // console.log(exifData.gps.GPSLatitude);
        return exifData.gps;
    } catch(err) {
        console.log(err);
        return null;
    }
}

function getGPSCoordinates(g) {
    // PARSE DMS needs a string in the format of:
    // 51:30:0.5486N 0:7:34.4503W
    // DEG:MIN:SECDIRECTION DEG:MIN:SECDIRECTION
    const latString = `${g.GPSLatitude[0]}:${g.GPSLatitude[1]}:${g.GPSLatitude[2]}${g.GPSLatitudeRef}`;
    const lonString = `${g.GPSLongitude[0]}:${g.GPSLongitude[1]}:${g.GPSLongitude[2]}${g.GPSLongitudeRef}`;

    const degCoords = parseDMS(`${latString} ${lonString}`);

    return degCoords;

}



// Entry Point function
async function writeToFS (imageData, thumbnailURL, finalURL) {
    const firestore = new Firestore( {
        projectId: "sp24-41200-rglopez-globaljags"
        // databaseId: "whatever you named it besides default"
    });

    // write the object into firestore
    const docRef = firestore.collection('photoDetails').doc();

    await docRef.set({ 
        latitude: imageData.lat,
        longitude: imageData.lon,
        thumbnailBucketURL: thumbnailURL,
        finalBucketURL: finalURL
    });

    console.log(`GPS coordinates written to Firestore: ${imageData.lat}, ${imageData.lon}`);
    console.log(`Thumbnail URL link has been pushed to Firestore: ${thumbnailURL}`);
    console.log(`Final Image URL link has been pushed to Firestore: ${finalURL}`);

}
