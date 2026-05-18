/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { FunctionResponseScheduling } from '@google/genai';
import { FunctionCall } from './state';

export const AVAILABLE_TOOLS: FunctionCall[] = [
  {
    name: 'start_return',
    description: 'Starts the return process for an item, collecting necessary details from the user.',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderId: {
          type: 'STRING',
          description: 'The ID of the order containing the item to be returned.',
        },
        itemName: {
          type: 'STRING',
          description: 'The name of the item the user wants to return.',
        },
        reason: {
          type: 'STRING',
          description: 'The reason the user is returning the item.',
        },
      },
      required: ['orderId', 'itemName', 'reason'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'get_order_status',
    description: 'Provides the current status of a user\'s order, searching by order ID or customer details.',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderId: {
          type: 'STRING',
          description: 'The ID of the order to check. Ask for this first.',
        },
        customerName: {
          type: 'STRING',
          description: 'The name of the customer, if order ID is not available.',
        },
        customerEmail: {
          type: 'STRING',
          description: 'The email of the customer, if order ID is not available.',
        },
      },
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'speak_to_representative',
    description: 'Escalates the conversation to a human customer support representative.',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: {
          type: 'STRING',
          description: 'A brief summary of the user\'s issue for the representative.',
        },
      },
      required: ['reason'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'save_memory',
    description: 'Saves a specific piece of information or conversation topic into the user\'s long-term memory for future recall.',
    parameters: {
      type: 'OBJECT',
      properties: {
        content: {
          type: 'STRING',
          description: 'The specific fact, preference, or topic to remember.',
        },
        type: {
          type: 'STRING',
          description: 'The category of memory (e.g., personal, work, project).',
          enum: ['personal', 'work', 'project'],
        },
      },
      required: ['content', 'type'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'list_google_chat_spaces',
    description: 'Lists the Google Chat spaces the user is a member of. Returns space names and resource names.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
    isEnabled: true,
  },
  {
    name: 'send_google_chat_message',
    description: 'Sends a message to a specific Google Chat space. You must use list_google_chat_spaces to get the space resource name first.',
    parameters: {
      type: 'OBJECT',
      properties: {
        spaceName: {
          type: 'STRING',
          description: 'The resource name of the space (e.g., spaces/AAAAxxxxxxx).',
        },
        messageText: {
          type: 'STRING',
          description: 'The text message to send.',
        },
      },
      required: ['spaceName', 'messageText'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'save_knowledge_keep',
    description: 'Saves important AI corrections and user preferences to a Google Keep note as persistent knowledge.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: {
          type: 'STRING',
          description: 'The corrected knowledge or preference to save.',
        },
      },
      required: ['text'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'display_map',
    description: 'Displays a Google Map with the provided iframe source URL on the user\'s screen.',
    parameters: {
      type: 'OBJECT',
      properties: {
        iframeSrc: {
          type: 'STRING',
          description: 'The src URL to embed for the map iframe.',
        },
      },
      required: ['iframeSrc'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'create_google_doc',
    description: 'Creates a new Google Doc with the specified title.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'The title of the new document.' }
      },
      required: ['title']
    },
    isEnabled: true,
  },
  {
    name: 'create_google_sheet',
    description: 'Creates a new Google Sheet with the specified title.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'The title of the new spreadsheet.' }
      },
      required: ['title']
    },
    isEnabled: true,
  },
  {
    name: 'create_google_slide',
    description: 'Creates a new Google Slide presentation with the specified title.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'The title of the new presentation.' }
      },
      required: ['title']
    },
    isEnabled: true,
  },
  {
    name: 'create_google_form',
    description: 'Creates a new Google Form with the specified title.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'The title of the new form.' }
      },
      required: ['title']
    },
    isEnabled: true,
  },
  {
    name: 'open_drive_picker',
    description: 'Opens a Google Drive file picker to let the user select a file.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    },
    isEnabled: true,
  },
  {
    name: 'schedule_meeting',
    description: 'Schedules a calendar meeting/event using Google Calendar API.',
    parameters: {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING', description: 'Title or summary of the meeting.' },
        startDateTime: { type: 'STRING', description: 'Start time in RFC3339 format.' },
        endDateTime: { type: 'STRING', description: 'End time in RFC3339 format.' },
      },
      required: ['summary', 'startDateTime', 'endDateTime']
    },
    isEnabled: true,
  },
  {
    name: 'fetch_google_api',
    description: 'Fetches data from a Google API. Provide the full endpoint URL. Useful for Gmail, Calendar, Contacts, Drive APIs. Method is GET.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'The full Google API URL to fetch from (e.g. https://www.googleapis.com/calendar/v3/users/me/calendarList)'
        }
      },
      required: ['url']
    },
    isEnabled: true,
  },
  {
    name: 'send_email',
    description: 'Sends an email using the Gmail API.',
    parameters: {
      type: 'OBJECT',
      properties: {
        to: { type: 'STRING', description: 'The recipient email address.' },
        subject: { type: 'STRING', description: 'The email subject.' },
        body: { type: 'STRING', description: 'The email body text.' }
      },
      required: ['to', 'subject', 'body']
    },
    isEnabled: true,
  },
];
