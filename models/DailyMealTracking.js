const mongoose = require('mongoose');

const dailyMealTrackingSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer ID is required']
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomerSubscription',
    required: [true, 'Subscription ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  meals: {
    breakfast: {
      served: {
        type: Boolean,
        default: false
      },
      consumed: {
        type: Boolean,
        default: false
      },
      servedTime: {
        type: Date
      },
      notes: {
        type: String,
        trim: true
      }
    },
    lunch: {
      served: {
        type: Boolean,
        default: false
      },
      consumed: {
        type: Boolean,
        default: false
      },
      servedTime: {
        type: Date
      },
      notes: {
        type: String,
        trim: true
      }
    },
    dinner: {
      served: {
        type: Boolean,
        default: false
      },
      consumed: {
        type: Boolean,
        default: false
      },
      servedTime: {
        type: Date
      },
      notes: {
        type: String,
        trim: true
      }
    }
  },
  specialRequests: {
    type: String,
    trim: true
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true
    }
  },
  attendance: {
    type: String,
    enum: ['present', 'absent', 'partial'],
    default: 'present'
  },
  recordedBy: {
    type: String,
    required: true,
    default: 'System'
  }
}, {
  timestamps: true
});

// Indexes for better performance
dailyMealTrackingSchema.index({ customerId: 1 });
dailyMealTrackingSchema.index({ subscriptionId: 1 });
dailyMealTrackingSchema.index({ date: 1 });
dailyMealTrackingSchema.index({ attendance: 1 });

// Compound index for unique customer-date combination
dailyMealTrackingSchema.index({ 
  customerId: 1, 
  date: 1 
}, { unique: true });

// Virtual to get total meals served
dailyMealTrackingSchema.virtual('totalMealsServed').get(function() {
  return (this.meals.breakfast.served ? 1 : 0) + 
         (this.meals.lunch.served ? 1 : 0) + 
         (this.meals.dinner.served ? 1 : 0);
});

// Virtual to get total meals consumed
dailyMealTrackingSchema.virtual('totalMealsConsumed').get(function() {
  return (this.meals.breakfast.consumed ? 1 : 0) + 
         (this.meals.lunch.consumed ? 1 : 0) + 
         (this.meals.dinner.consumed ? 1 : 0);
});

// Method to get meal consumption summary
dailyMealTrackingSchema.methods.getMealSummary = function() {
  return {
    breakfast: {
      eligible: this.subscription?.effectiveMeals?.breakfast || false,
      served: this.meals.breakfast.served,
      consumed: this.meals.breakfast.consumed
    },
    lunch: {
      eligible: this.subscription?.effectiveMeals?.lunch || false,
      served: this.meals.lunch.served,
      consumed: this.meals.lunch.consumed
    },
    dinner: {
      eligible: this.subscription?.effectiveMeals?.dinner || false,
      served: this.meals.dinner.served,
      consumed: this.meals.dinner.consumed
    }
  };
};

// Pre-save middleware to auto-calculate attendance
dailyMealTrackingSchema.pre('save', function(next) {
  const totalServed = this.totalMealsServed;
  
  if (totalServed === 0) {
    this.attendance = 'absent';
  } else {
    // Check against subscription to determine if partial
    // This would need subscription data to be fully accurate
    const totalConsumed = this.totalMealsConsumed;
    if (totalConsumed === totalServed) {
      this.attendance = 'present';
    } else if (totalConsumed > 0) {
      this.attendance = 'partial';
    } else {
      this.attendance = 'absent';
    }
  }
  
  next();
});

module.exports = mongoose.model('DailyMealTracking', dailyMealTrackingSchema);