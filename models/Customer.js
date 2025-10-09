const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  countryCode: {
    type: String,
    required: [true, 'Country code is required'],
    default: '+971',
    match: [/^\+971$/, 'Only UAE country code (+971) is supported']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[5][0-9]{8}$/, 'Please enter a valid UAE mobile number (9 digits starting with 5)']
  },
  fullPhoneNumber: {
    type: String,
    unique: true,
    index: true
  },
  email: {
    type: String,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    lowercase: true,
    trim: true,
    sparse: true // Allow multiple documents with null/undefined email
  },
  emirates: {
    type: String,
    required: [true, 'Emirates is required'],
    enum: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'],
    trim: true
  },
  deliveryAddress: {
    area: { 
      type: String, 
      required: [true, 'Area is required'],
      trim: true
    },
    buildingName: { 
      type: String, 
      required: [true, 'Building name is required'],
      trim: true
    },
    flatNumber: { 
      type: String, 
      required: [true, 'Flat number is required'],
      trim: true
    },
    street: { type: String, trim: true },
    landmark: { type: String, trim: true },
    city: { type: String, default: 'Your City' },
    coordinates: {
      latitude: {
        type: Number,
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90']
      },
      longitude: {
        type: Number,
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180']
      }
    }
  },
  // Meal plans are now handled in CustomerSubscription model
  // This keeps customer data clean and subscription data separate
  joinDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  updatedBy: {
    type: String,
    trim: true
  }
}, {
  timestamps: true // This automatically adds createdAt and updatedAt fields
});

// Pre-save middleware to combine country code and phone number
customerSchema.pre('save', function(next) {
  if (this.countryCode && this.phone) {
    this.fullPhoneNumber = this.countryCode + this.phone;
  }
  next();
});

// Indexes for better performance
customerSchema.index({ fullPhoneNumber: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ emirates: 1 });
customerSchema.index({ 'deliveryAddress.area': 1 });
customerSchema.index({ 'deliveryAddress.buildingName': 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ createdAt: 1 });
customerSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('Customer', customerSchema);