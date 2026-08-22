const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// List of directories and files to copy
const dirsToCopy = ['css', 'fonts', 'icons', 'js', 'wasm', 'screenshots'];
const fileExtsToCopy = ['.html', '.json', '.js', '.png', '.jpg', '.svg', '.md', '.xml', '.txt'];

function copyRecursiveSync(src, dest) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    const isDirectory = stats.isDirectory();
    
    if (isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Create www if it doesn't exist
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir);

// Copy directories
dirsToCopy.forEach(dir => {
    const src = path.join(srcDir, dir);
    const dest = path.join(destDir, dir);
    if (fs.existsSync(src)) {
        copyRecursiveSync(src, dest);
    }
});

// Copy root files
fs.readdirSync(srcDir).forEach(file => {
    const srcPath = path.join(srcDir, file);
    if (fs.statSync(srcPath).isFile()) {
        const ext = path.extname(file).toLowerCase();
        // Exclude build.js, capacitor-wrapper.js itself, and package/capacitor stuff
        if (fileExtsToCopy.includes(ext) && !file.includes('package') && !file.includes('capacitor') && file !== 'build.js') {
            fs.copyFileSync(srcPath, path.join(destDir, file));
        }
    }
});

// Copy capacitor wrapper
const wrapperSrc = path.join(srcDir, 'capacitor-wrapper.js');
if (fs.existsSync(wrapperSrc)) {
    fs.copyFileSync(wrapperSrc, path.join(destDir, 'js', 'capacitor-wrapper.js'));
}

// Inject capacitor-wrapper.js into index.html in the www directory
const indexPath = path.join(destDir, 'index.html');
if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');

    html = html.replace(
        /<meta name="viewport" content="[^"]*"\s*\/?>/,
        '<meta name="viewport" content="width=459, user-scalable=no, viewport-fit=cover"/>'
    );

    if (html.includes('</body>')) {
        html = html.replace('</body>', '<script src="js/capacitor-wrapper.js"></script></body>');
    } else {
        html += '<script src="js/capacitor-wrapper.js"></script>';
    }
    fs.writeFileSync(indexPath, html);
}

console.log('Build complete. Files copied to www/ and Capacitor wrapper injected.');

// Sync www/ to native Android assets directory
const androidAssetsDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');
if (fs.existsSync(path.join(__dirname, 'android'))) {
    if (!fs.existsSync(androidAssetsDir)) fs.mkdirSync(androidAssetsDir, { recursive: true });
    copyRecursiveSync(destDir, androidAssetsDir);
    console.log('Synced www/ to android/app/src/main/assets/public.');
}

const AdmZip = require('adm-zip');
const zip = new AdmZip();
zip.addLocalFolder(destDir);
zip.writeZip(path.join(__dirname, 'update.zip'));
console.log('Created update.zip for Capgo auto-updater.');
