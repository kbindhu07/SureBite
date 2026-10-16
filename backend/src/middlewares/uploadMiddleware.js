import multer from 'multer';

// Use memory storage so files are streamed directly to Cloudinary and not saved on server disk
const storage = multer.memoryStorage();

export const MAX_MENU_PHOTOS = 10;

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB Max Limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Choose a JPG, PNG or WebP image.'));
  }
});
// Accepts up to MAX_MENU_PHOTOS photos in the "image" field and returns upload errors as JSON
export const uploadMenuPhotos = (req, res, next) => {
  upload.array('image', MAX_MENU_PHOTOS)(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Each photo must be smaller than 10 MB.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: `You can upload up to ${MAX_MENU_PHOTOS} photos per menu.` });
    }
    return res.status(400).json({ message: error.message });
  });
};
