const mongoose = require('mongoose');

const mealPlanSchema = new mongoose.Schema({
  planName: {
    type: String,
    required: [true, 'Plan name is required'],
    unique: true,
    trim: true
  },
  planCode: {
    type: String,
    required: [true, 'Plan code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  meals: {
    breakfast: {
      type: Boolean,
      default: false
    },
    lunch: {
      type: Boolean,
      default: false
    },
    dinner: {
      type: Boolean,
      default: false
    }
  },
  pricing: {
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      default: 'AED',
      enum: ['AED', 'USD', 'INR']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    required: true,
    default: 'System'
  }
}, {
  timestamps: true
});

// Indexes for better performance
mealPlanSchema.index({ planCode: 1 });
mealPlanSchema.index({ isActive: 1 });
mealPlanSchema.index({ 'pricing.basePrice': 1 });

// Virtual to get meal count
mealPlanSchema.virtual('mealCount').get(function() {
  return (this.meals.breakfast ? 1 : 0) + 
         (this.meals.lunch ? 1 : 0) + 
         (this.meals.dinner ? 1 : 0);
});

// Method to get meal types as array
mealPlanSchema.methods.getMealTypes = function() {
  const meals = [];
  if (this.meals.breakfast) meals.push('breakfast');
  if (this.meals.lunch) meals.push('lunch');
  if (this.meals.dinner) meals.push('dinner');
  return meals;
};

module.exports = mongoose.model('MealPlan', mealPlanSchema);