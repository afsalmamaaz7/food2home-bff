const mongoose = require('mongoose');

const messPlanSchema = new mongoose.Schema({
  planName: {
    type: String,
    required: [true, 'Plan name is required'],
    unique: true,
    enum: ['Breakfast Only', 'Lunch Only', 'Dinner Only', 'Breakfast + Lunch', 'Lunch + Dinner', 'Full Day (3 Meals)', 'Custom']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  mealsIncluded: {
    breakfast: { type: Boolean, default: false },
    lunch: { type: Boolean, default: false },
    dinner: { type: Boolean, default: false }
  },
  monthlyPrice: {
    type: Number,
    required: [true, 'Monthly price is required'],
    min: [0, 'Price cannot be negative']
  },
  features: [String], // e.g., ['Home delivery', 'Fresh ingredients', 'Customizable']
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better performance
messPlanSchema.index({ planName: 1 });
messPlanSchema.index({ isActive: 1 });
messPlanSchema.index({ monthlyPrice: 1 });

module.exports = mongoose.model('MessPlan', messPlanSchema);