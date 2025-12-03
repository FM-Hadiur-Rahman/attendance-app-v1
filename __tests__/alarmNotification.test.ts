import { scheduleEndShiftAlarm, cancelScheduledAlarm } from '../api/checkin_checkout';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  AndroidNotificationPriority: {
    HIGH: 'high',
  },
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
}));

describe('Alarm Notification Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should schedule alarm notification 2 minutes before shift end', async () => {
    const mockSchedule = {
      end_time: '17:00',
      start_time: '09:00',
    };
    
    const mockCheckInTime = '2023-10-10T09:00:00';
    
    const mockNotificationId = 'notification-123';
    const scheduleNotificationAsync = require('expo-notifications').scheduleNotificationAsync;
    scheduleNotificationAsync.mockResolvedValue(mockNotificationId);
    
    const result = await scheduleEndShiftAlarm(mockSchedule, mockCheckInTime);
    
    expect(result).toBe(mockNotificationId);
    expect(scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Shift Ending Soon',
        body: 'Your shift ends in 2 minutes. Please prepare to check out.',
        sound: 'default',
        priority: 'high',
        color: '#3b82f6',
      },
      trigger: {
        date: expect.any(Date),
        type: 'date',
      },
    });
  });

  test('should not schedule alarm if end_time is missing', async () => {
    const mockSchedule = {
      start_time: '09:00',
    };
    
    const mockCheckInTime = '2023-10-10T09:00:00';
    
    const result = await scheduleEndShiftAlarm(mockSchedule, mockCheckInTime);
    
    expect(result).toBeNull();
  });

  test('should handle cross-day shifts correctly', async () => {
    const mockSchedule = {
      end_time: '02:00', // End time is next day
      start_time: '22:00', // Start time is current day
    };
    
    const mockCheckInTime = '2023-10-10T22:00:00';
    
    const mockNotificationId = 'notification-123';
    const scheduleNotificationAsync = require('expo-notifications').scheduleNotificationAsync;
    scheduleNotificationAsync.mockResolvedValue(mockNotificationId);
    
    const result = await scheduleEndShiftAlarm(mockSchedule, mockCheckInTime);
    
    expect(result).toBe(mockNotificationId);
  });

  test('should not schedule alarm if alarm time has already passed', async () => {
    const mockSchedule = {
      end_time: '17:00',
      start_time: '09:00',
    };
    
    // Set check-in time to a future date so alarm time is in the past
    const mockCheckInTime = '2020-10-10T09:00:00';
    
    const result = await scheduleEndShiftAlarm(mockSchedule, mockCheckInTime);
    
    expect(result).toBeNull();
  });

  test('should cancel scheduled alarm', async () => {
    const mockNotificationId = 'notification-123';
    const cancelScheduledNotificationAsync = require('expo-notifications').cancelScheduledNotificationAsync;
    cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    
    await cancelScheduledAlarm(mockNotificationId);
    
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(mockNotificationId);
  });
});