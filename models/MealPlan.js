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
      type: mongoose.Schema.Types.Mixed,
      default: false,
      validate: {
        validator: function(value) {
          // Support both boolean (old format) and object (new format)
          return typeof value === 'boolean' || 
                 (typeof value === 'object' && value !== null && typeof value.enabled === 'boolean');
        },
        message: 'Meal must be either boolean or object with enabled property'
      }
    },
    lunch: {
      type: mongoose.Schema.Types.Mixed,
      default: false,
      validate: {
        validator: function(value) {
          return typeof value === 'boolean' || 
                 (typeof value === 'object' && value !== null && typeof value.enabled === 'boolean');
        },
        message: 'Meal must be either boolean or object with enabled property'
      }
    },
    dinner: {
      type: mongoose.Schema.Types.Mixed,
      default: false,
      validate: {
        validator: function(value) {
          return typeof value === 'boolean' || 
                 (typeof value === 'object' && value !== null && typeof value.enabled === 'boolean');
        },
        message: 'Meal must be either boolean or object with enabled property'
      }
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

// Helper function to check if meal is enabled
const isMealEnabled = (mealData) => {
  if (typeof mealData === 'boolean') return mealData;
  if (typeof mealData === 'object' && mealData !== null) return mealData.enabled;
  return false;
};

// Virtual to get meal count
mealPlanSchema.virtual('mealCount').get(function() {
  return (isMealEnabled(this.meals.breakfast) ? 1 : 0) + 
         (isMealEnabled(this.meals.lunch) ? 1 : 0) + 
         (isMealEnabled(this.meals.dinner) ? 1 : 0);
});

// Method to get meal types as array
mealPlanSchema.methods.getMealTypes = function() {
  const meals = [];
  if (isMealEnabled(this.meals.breakfast)) meals.push('breakfast');
  if (isMealEnabled(this.meals.lunch)) meals.push('lunch');
  if (isMealEnabled(this.meals.dinner)) meals.push('dinner');
  return meals;
};

// Method to get meal with delivery times
mealPlanSchema.methods.getMealsWithDeliveryTimes = function() {
  const meals = {};
  
  ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
    const mealData = this.meals[mealType];
    if (isMealEnabled(mealData)) {
      meals[mealType] = {
        enabled: true,
        deliveryTime: (typeof mealData === 'object' && mealData.deliveryTime) ? mealData.deliveryTime : 'standard'
      };
    }
  });
  
  return meals;
};

module.exports = mongoose.model('MealPlan', mealPlanSchema);