const DailyMealTracking = require('../models/DailyMealTracking');
const CustomerSubscription = require('../models/CustomerSubscription');
const Customer = require('../models/Customer');

// @desc    Get daily tracking records
// @route   GET /api/daily-tracking
// @access  Private
const getDailyRecords = async (req, res) => {
  try {
    const { date, startDate, endDate, customerId } = req.query;
    
    let query = {};
    
    if (date) {
      query.date = new Date(date);
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (customerId) {
      query.customerId = customerId;
    }

    const records = await DailyMealTracking.find(query)
      .populate('customerId', 'name phone email')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      data: {
        records,
        count: records.length
      }
    });

  } catch (error) {
    console.error('Get daily records error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching daily records' 
    });
  }
};

// @desc    Mark meal attendance  
// @route   POST /api/daily-tracking/attendance
// @access  Private
const markAttendance = async (req, res) => {
  try {
    const { customerId, date, mealType, attended, markedBy } = req.body;

    if (!customerId || !date || !mealType || attended === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID, date, meal type, and attendance status are required'
      });
    }

    const trackingDate = new Date(date);
    
    // Find customer's active subscription for this date
    const activeSubscription = await CustomerSubscription.findOne({
      customerId,
      status: 'active',
      startDate: { $lte: trackingDate },
      endDate: { $gte: trackingDate }
    });

    if (!activeSubscription) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found for this customer and date'
      });
    }

    // Find existing record for this customer and date
    let dailyRecord = await DailyMealTracking.findOne({
      customerId,
      date: trackingDate
    });

    if (!dailyRecord) {
      // Create new daily record with proper structure
      dailyRecord = new DailyMealTracking({
        customerId,
        subscriptionId: activeSubscription._id,
        date: trackingDate,
        meals: {
          breakfast: { served: false, consumed: false, servedTime: null, notes: '' },
          lunch: { served: false, consumed: false, servedTime: null, notes: '' },
          dinner: { served: false, consumed: false, servedTime: null, notes: '' }
        },
        recordedBy: markedBy || 'System'
      });
    }

    // Update the specific meal attendance (both served and consumed for simplicity)
    dailyRecord.meals[mealType] = {
      served: attended,
      consumed: attended,
      servedTime: attended ? new Date() : null,
      notes: dailyRecord.meals[mealType]?.notes || ''
    };

    // Update recordedBy
    dailyRecord.recordedBy = markedBy || 'System';

    await dailyRecord.save();

    // Populate customer info before sending response
    await dailyRecord.populate('customerId', 'name phone email');

    res.status(200).json({
      success: true,
      data: { record: dailyRecord },
      message: `${mealType} attendance marked successfully`
    });

  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error marking attendance' 
    });
  }
};

// @desc    Get today's attendance statistics
// @route   GET /api/daily-tracking/stats/today
// @access  Private
const getTodayStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all active subscriptions for today
    const activeSubscriptions = await CustomerSubscription.find({
      status: 'active',
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).populate('mealPlanId customerId');

    // Get today's attendance records
    const todayRecords = await DailyMealTracking.find({
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    // Calculate statistics
    const stats = {
      totalExpected: 0,
      totalAttended: 0,
      attendanceRate: 0,
      breakfast: { expected: 0, attended: 0 },
      lunch: { expected: 0, attended: 0 },
      dinner: { expected: 0, attended: 0 }
    };

    // Count expected meals based on active subscriptions
    activeSubscriptions.forEach(subscription => {
      const mealPlan = subscription.mealPlanId;
      if (mealPlan && mealPlan.meals) {
        if (mealPlan.meals.breakfast) {
          stats.breakfast.expected++;
          stats.totalExpected++;
        }
        if (mealPlan.meals.lunch) {
          stats.lunch.expected++;
          stats.totalExpected++;
        }
        if (mealPlan.meals.dinner) {
          stats.dinner.expected++;
          stats.totalExpected++;
        }
      }
    });

    // Count actual attendance
    todayRecords.forEach(record => {
      if (record.meals.breakfast && record.meals.breakfast.attended) {
        stats.breakfast.attended++;
        stats.totalAttended++;
      }
      if (record.meals.lunch && record.meals.lunch.attended) {
        stats.lunch.attended++;
        stats.totalAttended++;
      }
      if (record.meals.dinner && record.meals.dinner.attended) {
        stats.dinner.attended++;
        stats.totalAttended++;
      }
    });

    // Calculate attendance rate
    stats.attendanceRate = stats.totalExpected > 0 
      ? Math.round((stats.totalAttended / stats.totalExpected) * 100)
      : 0;

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get today stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching today\'s statistics' 
    });
  }
};

// @desc    Create daily tracking record
// @route   POST /api/daily-tracking
// @access  Private
const createDailyTracking = async (req, res) => {
  try {
    const { customerId, date, meals, notes } = req.body;

    if (!customerId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and date are required'
      });
    }

    // Check if record already exists
    const existingRecord = await DailyMealTracking.findOne({
      customerId,
      date: new Date(date)
    });

    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Daily tracking record already exists for this date'
      });
    }

    const dailyRecord = new DailyMealTracking({
      customerId,
      date: new Date(date),
      meals: meals || {
        breakfast: { attended: false, markedAt: null, markedBy: null },
        lunch: { attended: false, markedAt: null, markedBy: null },
        dinner: { attended: false, markedAt: null, markedBy: null }
      },
      notes
    });

    await dailyRecord.save();
    await dailyRecord.populate('customerId', 'name phone email');

    res.status(201).json({
      success: true,
      data: { record: dailyRecord },
      message: 'Daily tracking record created successfully'
    });

  } catch (error) {
    console.error('Create daily tracking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error creating daily tracking record' 
    });
  }
};

module.exports = {
  getDailyRecords,
  markAttendance,
  getTodayStats,
  createDailyTracking
};