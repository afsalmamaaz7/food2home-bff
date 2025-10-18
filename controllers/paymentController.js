const Payment = require('../models/Payment');
const Customer = require('../models/Customer');

// @desc    Get all payments with filters
// @route   GET /api/payments
// @access  Private (Admin)
const getPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { status, month, year, customerId } = req.query;

    // Build filter query
    let query = {};
    if (status) query.paymentStatus = status;
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (customerId) query.customer = customerId;

    const payments = await Payment.find(query)
      .populate('customer', 'name phone deliveryAddress')
      .populate('recordedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalPayments: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching payments' 
    });
  }
};

// @desc    Get single payment by ID
// @route   GET /api/payments/:id
// @access  Private (Admin)
const getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const payment = await Payment.findById(id).populate('customer', 'name phone email');
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment'
    });
  }
};

// @desc    Update payment by ID
// @route   PUT /api/payments/:id
// @access  Private (Admin)
const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove any fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.__v;

    // Map frontend field names to backend field names
    if (updateData.customerId) {
      updateData.customer = updateData.customerId;
      delete updateData.customerId;
    }
    if (updateData.amount) {
      updateData.amountDue = parseFloat(updateData.amount);
      delete updateData.amount;
    }
    if (updateData.status) {
      updateData.paymentStatus = updateData.status;
      delete updateData.status;
    }
    if (updateData.month) {
      // Convert YYYY-MM format to separate month and year
      const [year, month] = updateData.month.split('-');
      updateData.year = parseInt(year);
      updateData.month = parseInt(month);
      delete updateData.month;
    }

    const payment = await Payment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('customer', 'name phone email');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating payment'
    });
  }
};

// @desc    Delete payment record
// @route   DELETE /api/payments/:id
// @access  Private (Admin)
const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }

    // Delete the payment
    await Payment.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Payment deleted successfully',
      data: {
        deletedPaymentId: req.params.id
      }
    });

  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error deleting payment',
      error: error.message 
    });
  }
};

// @desc    Create payment record for customer
// @route   POST /api/payments
// @access  Private (Admin)
const createPayment = async (req, res) => {
  try {
    let createData = { ...req.body };

    // Map frontend field names to backend field names
    if (createData.customerId) {
      createData.customer = createData.customerId;
      delete createData.customerId;
    }
    if (createData.amount) {
      createData.amountDue = parseFloat(createData.amount);
      delete createData.amount;
    }
    if (createData.status) {
      createData.paymentStatus = createData.status;
      delete createData.status;
    }
    if (createData.month) {
      // Convert from YYYY-MM-DD format to separate month and year
      const dateStr = createData.month;
      if (dateStr.includes('-')) {
        const [year, month] = dateStr.split('-');
        createData.year = parseInt(year);
        createData.month = parseInt(month);
      }
    }

    // Set default values if not provided
    if (!createData.paymentStatus) {
      createData.paymentStatus = 'pending';
    }
    if (!createData.paymentMethod) {
      createData.paymentMethod = 'cash';
    }
    if (!createData.dueDate && createData.paymentDate) {
      createData.dueDate = createData.paymentDate;
    }

    // Check if customer exists and get their plan details
    const customer = await Customer.findById(createData.customer);
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    // Set plan details from customer's current plan
    if (!createData.planDetails && customer.messPlans && customer.messPlans.length > 0) {
      const currentPlan = customer.messPlans[0]; // Use the first plan
      createData.planDetails = {
        planName: currentPlan.planName || 'Standard Plan',
        monthlyAmount: currentPlan.monthlyAmount || createData.amountDue || 0
      };
    }

    // If still no plan details, use default
    if (!createData.planDetails) {
      createData.planDetails = {
        planName: 'Standard Plan',
        monthlyAmount: createData.amountDue || 0
      };
    }

    // Check if payment record already exists for this customer, month, year
    const existingPayment = await Payment.findOne({
      customer: createData.customer,
      month: createData.month,
      year: createData.year
    });

    if (existingPayment) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment record already exists for this month and year' 
      });
    }

    const payment = await Payment.create(createData);
    await payment.populate('customer', 'name phone email');

    res.status(201).json({
      success: true,
      message: 'Payment created successfully',
      data: payment
    });

  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error creating payment' 
    });
  }
};

// @desc    Record payment for a customer
// @route   POST /api/payments/:id/record
// @access  Private (Admin)
const recordPayment = async (req, res) => {
  try {
    const {
      amount,
      paymentMethod,
      transactionId,
      notes
    } = req.body;

    const payment = await Payment.findById(req.params.id)
      .populate('customer', 'name phone');

    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment record not found' 
      });
    }

    // Add to payment history
    payment.paymentHistory.push({
      amount,
      paymentMethod,
      transactionId,
      notes,
      recordedBy: req.user.id
    });

    // Update total paid amount
    payment.amountPaid += amount;
    payment.paymentMethod = paymentMethod;
    payment.transactionId = transactionId;

    // Set payment date if fully paid
    if (payment.amountPaid >= payment.amountDue) {
      payment.paymentDate = new Date();
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      data: { payment }
    });

  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error recording payment' 
    });
  }
};

// @desc    Get payment statistics
// @route   GET /api/payments/dashboard/stats
// @access  Private (Admin)
const getPaymentStats = async (req, res) => {
  try {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    // Get requested month/year from query params (defaults to current month)
    const requestedMonth = parseInt(req.query.month) || currentMonth;
    const requestedYear = parseInt(req.query.year) || currentYear;

    // Overall statistics (all payments)
    const totalPayments = await Payment.countDocuments({});
    const totalAmount = await Payment.aggregate([
      { $group: { _id: null, total: { $sum: '$amountDue' } } }
    ]);
    
    // Overall status wise count
    const overallStatusStats = await Payment.aggregate([
      { $group: { _id: '$paymentStatus', count: { $sum: 1 }, amount: { $sum: '$amountDue' } } }
    ]);

    // Current month stats
    const currentMonthPayments = await Payment.find({ month: currentMonth, year: currentYear });
    
    const totalDue = currentMonthPayments.reduce((sum, payment) => sum + payment.amountDue, 0);
    const totalPaid = currentMonthPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
    const pendingAmount = totalDue - totalPaid;

    // Status wise count for current month
    const currentMonthStatusStats = await Payment.aggregate([
      { $match: { month: currentMonth, year: currentYear } },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 }, amount: { $sum: '$amountDue' } } }
    ]);

    // Requested month stats (for filtered view)
    const requestedMonthPayments = await Payment.find({ month: requestedMonth, year: requestedYear });
    
    const requestedTotalDue = requestedMonthPayments.reduce((sum, payment) => sum + payment.amountDue, 0);
    const requestedTotalPaid = requestedMonthPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
    const requestedPendingAmount = requestedTotalDue - requestedTotalPaid;

    // Status wise count for requested month
    const requestedMonthStatusStats = await Payment.aggregate([
      { $match: { month: requestedMonth, year: requestedYear } },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 }, amount: { $sum: '$amountDue' } } }
    ]);

    // Overdue payments (overall)
    const overduePayments = await Payment.countDocuments({
      paymentStatus: 'overdue'
    });

    // Monthly collection trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await Payment.aggregate([
      { 
        $match: { 
          createdAt: { $gte: sixMonthsAgo },
          paymentStatus: 'paid'
        } 
      },
      {
        $group: {
          _id: { month: '$month', year: '$year' },
          totalCollected: { $sum: '$amountPaid' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overall: {
          totalPayments,
          totalAmount: totalAmount[0]?.total || 0,
          statusStats: overallStatusStats
        },
        currentMonth: {
          totalDue,
          totalPaid,
          pendingAmount,
          collectionPercentage: totalDue > 0 ? ((totalPaid / totalDue) * 100).toFixed(2) : 0,
          statusStats: currentMonthStatusStats
        },
        requestedMonth: {
          month: requestedMonth,
          year: requestedYear,
          totalDue: requestedTotalDue,
          totalPaid: requestedTotalPaid,
          pendingAmount: requestedPendingAmount,
          collectionPercentage: requestedTotalDue > 0 ? ((requestedTotalPaid / requestedTotalDue) * 100).toFixed(2) : 0,
          statusStats: requestedMonthStatusStats
        },
        overduePayments,
        monthlyTrend
      }
    });

  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching payment statistics' 
    });
  }
};

// @desc    Generate monthly report
// @route   GET /api/payments/reports/monthly
// @access  Private (Admin)
const getMonthlyReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({ 
        success: false, 
        message: 'Month and year are required' 
      });
    }

    const payments = await Payment.find({ 
      month: parseInt(month), 
      year: parseInt(year) 
    })
    .populate('customer', 'name phone deliveryAddress')
    .sort({ 'customer.name': 1 });

    // Calculate totals
    const totalCustomers = payments.length;
    const totalDue = payments.reduce((sum, payment) => sum + payment.amountDue, 0);
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
    const totalPending = totalDue - totalPaid;

    // Status breakdown
    const statusBreakdown = payments.reduce((acc, payment) => {
      acc[payment.paymentStatus] = (acc[payment.paymentStatus] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        summary: {
          month: parseInt(month),
          year: parseInt(year),
          totalCustomers,
          totalDue,
          totalPaid,
          totalPending,
          collectionPercentage: totalDue > 0 ? ((totalPaid / totalDue) * 100).toFixed(2) : 0,
          statusBreakdown
        },
        payments
      }
    });

  } catch (error) {
    console.error('Get monthly report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error generating monthly report' 
    });
  }
};

// @desc    Generate yearly report
// @route   GET /api/payments/reports/yearly
// @access  Private (Admin)
const getYearlyReport = async (req, res) => {
  try {
    const { year } = req.query;
    
    if (!year) {
      return res.status(400).json({ 
        success: false, 
        message: 'Year is required' 
      });
    }

    const yearlyData = await Payment.aggregate([
      { $match: { year: parseInt(year) } },
      {
        $group: {
          _id: '$month',
          totalDue: { $sum: '$amountDue' },
          totalPaid: { $sum: '$amountPaid' },
          customerCount: { $sum: 1 },
          paidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] } },
          overdueCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const totalYearlyDue = yearlyData.reduce((sum, month) => sum + month.totalDue, 0);
    const totalYearlyPaid = yearlyData.reduce((sum, month) => sum + month.totalPaid, 0);

    res.status(200).json({
      success: true,
      data: {
        year: parseInt(year),
        summary: {
          totalDue: totalYearlyDue,
          totalPaid: totalYearlyPaid,
          totalPending: totalYearlyDue - totalYearlyPaid,
          collectionPercentage: totalYearlyDue > 0 ? ((totalYearlyPaid / totalYearlyDue) * 100).toFixed(2) : 0
        },
        monthlyBreakdown: yearlyData.map(month => ({
          month: month._id,
          monthName: new Date(2024, month._id - 1).toLocaleString('default', { month: 'long' }),
          totalDue: month.totalDue,
          totalPaid: month.totalPaid,
          customerCount: month.customerCount,
          collectionPercentage: month.totalDue > 0 ? ((month.totalPaid / month.totalDue) * 100).toFixed(2) : 0,
          statusBreakdown: {
            paid: month.paidCount,
            pending: month.pendingCount,
            overdue: month.overdueCount
          }
        }))
      }
    });

  } catch (error) {
    console.error('Get yearly report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error generating yearly report' 
    });
  }
};

module.exports = {
  getPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  recordPayment,
  getPaymentStats,
  getMonthlyReport,
  getYearlyReport
};