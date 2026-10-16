import mongoose from 'mongoose';
import { CANONICAL_ALLERGENS, DIETARY_TYPES, MENU_STATUSES, CURRENCIES } from '../utils/constants.js';

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  price: {
    type: Number,
    default: null,
  },
  category: {
    type: String,
    default: 'Main Courses',
    trim: true,
  },
  dietaryType: {
    type: String,
    enum: DIETARY_TYPES,
    default: 'veg',
  },
  allergens: [{
    type: String,
    enum: CANONICAL_ALLERGENS,
  }],
  aiInferred: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
});

const menuSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      default: 'Menu Draft',
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'INR',
    },
    status: {
      type: String,
      enum: MENU_STATUSES,
      default: 'draft',
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    cloudinaryPublicId: {
      type: String,
      default: null,
    },
    // Every page of a multi-photo menu; imageUrl/cloudinaryPublicId hold the first page
    imageUrls: {
      type: [String],
      default: [],
    },
    cloudinaryPublicIds: {
      type: [String],
      default: [],
    },
    items: [menuItemSchema],
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const Menu = mongoose.model('Menu', menuSchema);
export default Menu;