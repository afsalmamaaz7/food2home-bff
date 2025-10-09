const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  planDetails: {
    planName: {
      type: String,
      required: true
    },
    monthlyAmount: {
      type: Number,
      required: true,
      min: [0, 'Amount cannot be negative']
    },
    finalAmount: {
      type: Number,
      min: [0, 'Amount cannot be negative']
    },
    discountApplied: {
      type: {
        type: String,
        enum: ['percentage', 'fixed']
      },
      value: {
        type: Number,
        min: [0, 'Discount cannot be negative']
      },
      reason: String
    },
    subscriptionPeriod: {
      type: String,
      trim: true
    },
    subscriptionDays: {
      type: Number,
      min: [1, 'Subscription must be at least 1 day']
    }
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: [0, 'Paid amount cannot be negative']
  },
  amountDue: {
    type: Number,
    required: true,
    min: [0, 'Due amount cannot be negative']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'bank_transfer', 'card', 'cheque'],
    default: 'cash'
  },
  paymentDate: Date,
  dueDate: {
    type: Date,
    required: true
  },
  transactionId: String,
  receiptNumber: String,
  notes: String,
  paymentHistory: [{
    amount: {
      type: Number,
      required: true,
      min: [0, 'Payment amount cannot be negative']
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'upi', 'bank_transfer', 'card', 'cheque'],
      required: true
    },
    transactionId: String,
    paidDate: {
      type: Date,
      default: Date.now
    },
    notes: String,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Create compound index for better query performance (removed unique constraint to allow multiple payments per month)
paymentSchema.index({ customer: 1, month: 1, year: 1 });

// Other indexes for better performance
paymentSchema.index({ paymentStatus: 1 });
paymentSchema.index({ dueDate: 1 });
paymentSchema.index({ month: 1, year: 1 });
paymentSchema.index({ createdAt: -1 });

// Update payment status based on amount paid vs due
paymentSchema.pre('save', function(next) {
  if (this.amountPaid >= this.amountDue) {
    this.paymentStatus = 'paid';
  } else if (this.amountPaid > 0) {
    this.paymentStatus = 'partial';
  } else if (new Date() > this.dueDate) {
    this.paymentStatus = 'overdue';
  } else {
    this.paymentStatus = 'pending';
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);