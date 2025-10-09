const mongoose = require('mongoose');

const customerSubscriptionSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer ID is required']
  },
  mealPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MealPlan',
    required: [true, 'Meal plan ID is required']
  },
  subscriptionPeriod: {
    month: {
      type: Number,
      required: [true, 'Month is required'],
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
      min: 2020
    }
  },
  pricing: {
    basePricePerMonth: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Price cannot be negative']
    },
    discount: {
      type: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
      },
      value: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative']
      },
      reason: {
        type: String,
        trim: true
      }
    },
    finalPrice: {
      type: Number,
      required: true,
      min: [0, 'Final price cannot be negative']
    }
  },
  customMeals: {
    // Allow custom meal selection different from plan defaults
    breakfast: {
      type: Boolean,
      default: null // null means use plan default
    },
    lunch: {
      type: Boolean,
      default: null
    },
    dinner: {
      type: Boolean,
      default: null
    }
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'cancelled', 'completed'],
    default: 'active'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'overdue', 'refunded'],
    default: 'pending'
  },
  createdBy: {
    type: String,
    required: true,
    default: 'System'
  },
  updatedBy: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for better performance
customerSubscriptionSchema.index({ customerId: 1 });
customerSubscriptionSchema.index({ mealPlanId: 1 });
customerSubscriptionSchema.index({ 'subscriptionPeriod.month': 1, 'subscriptionPeriod.year': 1 });
customerSubscriptionSchema.index({ status: 1 });
customerSubscriptionSchema.index({ paymentStatus: 1 });
customerSubscriptionSchema.index({ startDate: 1, endDate: 1 });

// Compound index for better query performance (removed unique constraint to allow multiple subscriptions per month)
customerSubscriptionSchema.index({ 
  customerId: 1, 
  'subscriptionPeriod.month': 1, 
  'subscriptionPeriod.year': 1 
});

// Pre-save middleware to calculate final price
customerSubscriptionSchema.pre('save', function(next) {
  if (this.pricing.discount.type === 'percentage') {
    const discountAmount = (this.pricing.basePricePerMonth * this.pricing.discount.value) / 100;
    this.pricing.finalPrice = this.pricing.basePricePerMonth - discountAmount;
  } else if (this.pricing.discount.type === 'fixed') {
    this.pricing.finalPrice = Math.max(0, this.pricing.basePricePerMonth - this.pricing.discount.value);
  } else {
    this.pricing.finalPrice = this.pricing.basePricePerMonth;
  }
  next();
});

// Virtual to get effective meal selection
customerSubscriptionSchema.virtual('effectiveMeals').get(function() {
  return {
    breakfast: this.customMeals.breakfast !== null ? this.customMeals.breakfast : this.mealPlan?.meals?.breakfast || false,
    lunch: this.customMeals.lunch !== null ? this.customMeals.lunch : this.mealPlan?.meals?.lunch || false,
    dinner: this.customMeals.dinner !== null ? this.customMeals.dinner : this.mealPlan?.meals?.dinner || false
  };
});

// Method to check if subscription is active for a specific date
customerSubscriptionSchema.methods.isActiveOnDate = function(date) {
  return this.status === 'active' && 
         date >= this.startDate && 
         date <= this.endDate;
};

module.exports = mongoose.model('CustomerSubscription', customerSubscriptionSchema);