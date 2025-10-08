/**
 * Backend utility functions for calculating prorated amounts based on subscription dates
 */

/**
 * Get the number of days in a specific month
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @returns {number} Number of days in the month
 */
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

/**
 * Calculate the number of days between two dates (inclusive)
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {number} Number of days
 */
const calculateDaysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Reset time to start of day to avoid timezone issues
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays + 1; // +1 to include both start and end dates
};

/**
 * Calculate prorated amount based on subscription period
 * @param {number} basePricePerMonth - The full monthly price
 * @param {string|Date} startDate - Subscription start date
 * @param {string|Date} endDate - Subscription end date
 * @param {Object} discount - Discount object with type and value
 * @returns {Object} Calculation details including prorated amount
 */
const calculateProratedAmount = (basePricePerMonth, startDate, endDate, discount = null) => {
  if (!basePricePerMonth || !startDate || !endDate) {
    return {
      basePricePerMonth: 0,
      subscriptionDays: 0,
      monthDays: 30,
      proratedAmount: 0,
      discountAmount: 0,
      finalAmount: 0,
      proratedRatio: 0
    };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Calculate subscription days
  const subscriptionDays = calculateDaysBetween(startDate, endDate);
  
  // Get the number of days in the subscription month
  // For cross-month subscriptions, use the month with more days or average
  const startMonth = start.getMonth() + 1;
  const startYear = start.getFullYear();
  const endMonth = end.getMonth() + 1;
  const endYear = end.getFullYear();
  
  let monthDays;
  if (startMonth === endMonth && startYear === endYear) {
    // Same month subscription
    monthDays = getDaysInMonth(startYear, startMonth);
  } else {
    // Cross-month subscription - use average of both months
    const startMonthDays = getDaysInMonth(startYear, startMonth);
    const endMonthDays = getDaysInMonth(endYear, endMonth);
    monthDays = Math.round((startMonthDays + endMonthDays) / 2);
  }
  
  // Calculate prorated ratio
  const proratedRatio = subscriptionDays / monthDays;
  
  // Calculate prorated amount before discount
  const proratedAmount = Math.round((basePricePerMonth * proratedRatio) * 100) / 100;
  
  // Apply discount to prorated amount
  let discountAmount = 0;
  let finalAmount = proratedAmount;
  
  if (discount && discount.value > 0) {
    if (discount.type === 'percentage') {
      discountAmount = Math.round((proratedAmount * discount.value / 100) * 100) / 100;
    } else if (discount.type === 'fixed') {
      // For fixed discounts, prorate the discount as well
      const proratedDiscount = Math.round((discount.value * proratedRatio) * 100) / 100;
      discountAmount = Math.min(proratedDiscount, proratedAmount); // Don't discount more than the amount
    }
    finalAmount = Math.max(0, proratedAmount - discountAmount);
  }
  
  return {
    basePricePerMonth,
    subscriptionDays,
    monthDays,
    proratedAmount: Math.round(proratedAmount * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalAmount: Math.round(finalAmount * 100) / 100,
    proratedRatio: Math.round(proratedRatio * 10000) / 10000, // 4 decimal places
  };
};

/**
 * Validate if prorated calculation is needed
 * @param {string|Date} startDate - Subscription start date
 * @param {string|Date} endDate - Subscription end date
 * @returns {boolean} True if prorated calculation is needed
 */
const needsProration = (startDate, endDate) => {
  if (!startDate || !endDate) return false;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();
  const endMonth = end.getMonth();
  const endYear = end.getFullYear();
  
  // Check if it's a full month subscription
  if (startMonth === endMonth && startYear === endYear) {
    const monthDays = getDaysInMonth(startYear, startMonth + 1);
    const subscriptionDays = calculateDaysBetween(startDate, endDate);
    
    // Consider it a full month if it covers 90% or more of the month
    return subscriptionDays < (monthDays * 0.9);
  }
  
  // Cross-month subscriptions always need prorated calculation
  return true;
};

module.exports = {
  getDaysInMonth,
  calculateDaysBetween,
  calculateProratedAmount,
  needsProration
};