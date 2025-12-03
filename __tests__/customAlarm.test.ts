import { scheduleCustomAlarm, cancelNotification } from '../api/checkin_checkout';

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

describe('Custom Alarm Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should schedule custom alarm at specified time', async () => {
    const mockTitle = 'Test Alarm';
    const mockBody = 'This is a test alarm';
    const mockAlarmTime = new Date(Date.now() + 60000); // 1 minute in the future
    
    const mockNotificationId = 'notification-123';
    const scheduleNotificationAsync = require('expo-notifications').scheduleNotificationAsync;
    scheduleNotificationAsync.mockResolvedValue(mockNotificationId);
    
    const result = await scheduleCustomAlarm(mockTitle, mockBody, mockAlarmTime);
    
    expect(result).toBe(mockNotificationId);
    expect(scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: mockTitle,
        body: mockBody,
        sound: 'default',
        priority: 'high',
        color: '#3b82f6',
      },
      trigger: {
        date: mockAlarmTime,
        type: 'date',
      },
    });
  });

  test('should not schedule alarm if time has already passed', async () => {
    const mockTitle = 'Test Alarm';
    const mockBody = 'This is a test alarm';
    const mockAlarmTime = new Date(Date.now() - 60000); // 1 minute in the past
    
    const result = await scheduleCustomAlarm(mockTitle, mockBody, mockAlarmTime);
    
    expect(result).toBeNull();
  });

  test('should cancel scheduled alarm', async () => {
    const mockNotificationId = 'notification-123';
    const cancelScheduledNotificationAsync = require('expo-notifications').cancelScheduledNotificationAsync;
    cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    
    await cancelNotification(mockNotificationId);
    
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(mockNotificationId);
  });
});