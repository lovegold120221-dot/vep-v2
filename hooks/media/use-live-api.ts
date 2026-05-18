/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { LiveConnectConfig, Modality, LiveServerToolCall } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { useLogStore, useSettings, useAuth } from '@/lib/state';
import { auth } from '@/lib/firebase';
import * as api from '@/lib/api-client';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;

  volume: number;
};

export function useLiveApi({
  apiKey,
}: {
  apiKey: string;
}): UseLiveApiResults {
  const { model } = useSettings();
  const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<LiveConnectConfig>({});

  useEffect(() => {
    let isCancelled = false;
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out', sampleRate: 16000 }).then((audioCtx: AudioContext) => {
        if (isCancelled) return;
        if (audioStreamerRef.current) return;
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          })
          .catch(err => {
            console.error('Error adding worklet:', err);
          });
      });
    }
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
    };

    const onClose = () => {
      setConnected(false);
    };

    const stopAudioStreamer = () => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
    };

    const onAudio = (data: ArrayBuffer) => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.addPCM16(new Uint8Array(data));
      }
    };

    // Bind event listeners
    const onToolCall = async (toolCall: LiveServerToolCall) => {
      const functionResponses = await Promise.all(toolCall.functionCalls.map(async (fc) => {
        // Log the function call trigger
        const triggerMessage = `Triggering function call: **${fc.name}**\n\`\`\`json\n${JSON.stringify(fc.args, null, 2)}\n\`\`\``;
        useLogStore.getState().addTurn({
          role: 'system',
          text: triggerMessage,
          isFinal: true,
        });

        let responsePayload: any = { result: 'ok' };
        
        try {
          const { useUI, useAuth } = await import('../../lib/state');
          const ui = useUI.getState();
          const authState = useAuth.getState();
          const token = authState.googleAccessToken;

          switch (fc.name) {
            case 'get_current_datetime':
              responsePayload = {
                datetime: new Date().toISOString(),
                readable: new Date().toString()
              };
              break;

            case 'calculate':
              const { expression } = fc.args as any;
              if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
                responsePayload = { error: "Expression contains unsupported characters." };
              } else {
                // eslint-disable-next-line
                responsePayload = { result: new Function(`return (${expression})`)() };
              }
              break;

            case 'create_markdown_document':
            case 'create_html_document':
            case 'create_project_brief':
            case 'create_checklist':
            case 'create_json_file':
            case 'create_readme':
            case 'create_chart_spec':
            case 'extract_tasks':
              ui.setActiveWorkspaceResult({ artifact: fc.args });
              responsePayload = { status: 'Artifact created and displayed in UI.' };
              break;

            case 'save_note':
              const notes = JSON.parse(localStorage.getItem('eburon_notes') || '[]');
              notes.push({ ...fc.args, timestamp: new Date().toISOString() });
              localStorage.setItem('eburon_notes', JSON.stringify(notes));
              responsePayload = { status: 'Note saved successfully.' };
              break;

            case 'read_note':
              const allNotes = JSON.parse(localStorage.getItem('eburon_notes') || '[]');
              const note = allNotes.find((n: any) => n.name === (fc.args as any).name);
              responsePayload = note || { error: 'Note not found.' };
              break;

            case 'list_notes':
              responsePayload = { notes: JSON.parse(localStorage.getItem('eburon_notes') || '[]') };
              break;

            case 'validate_json':
              try {
                JSON.parse((fc.args as any).json_text);
                responsePayload = { valid: true };
              } catch (e) {
                responsePayload = { valid: false, error: (e as Error).message };
              }
              break;

            case 'execute_safe_command':
              if (token) {
                const res = await fetch(`/api/system_command?cmd=${encodeURIComponent((fc.args as any).command)}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                responsePayload = await res.json();
              } else {
                responsePayload = { error: 'Unauthorized: Command execution requires login.' };
              }
              break;

            case 'open_browser_url':
              window.open((fc.args as any).url, '_blank');
              responsePayload = { status: 'URL opened in a new tab.' };
              break;

            case 'save_memory':
              try {
                await api.saveMemory((fc.args as any).content, (fc.args as any).type || 'personal');
                responsePayload = { success: true, status: 'Memory saved successfully' };
              } catch (err: any) {
                responsePayload = { error: `Failed to save memory: ${err.message}` };
              }
              break;

            case 'create_task':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                 const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: (fc.args as any).title, notes: (fc.args as any).notes })
                 });
                 const data = await res.json();
                 responsePayload = res.ok ? { success: true, task: data } : { error: data.error?.message || "Unknown error" };
              }
              break;

            case 'create_google_doc':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                 const res = await fetch('https://docs.googleapis.com/v1/documents', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: (fc.args as any).title || 'Untitled Document' })
                 });
                 const data = await res.json();
                 responsePayload = res.ok ? { success: true, documentId: data.documentId, url: `https://docs.google.com/document/d/${data.documentId}/edit` } : { error: data.error?.message || "Unknown error" };
              }
              break;

            case 'create_google_sheet':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                 const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ properties: { title: (fc.args as any).title || 'Untitled Spreadsheet' } })
                 });
                 const data = await res.json();
                 responsePayload = res.ok ? { success: true, spreadsheetId: data.spreadsheetId, url: data.spreadsheetUrl } : { error: data.error?.message || "Unknown error" };
              }
              break;

            case 'create_google_slide':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                 const res = await fetch('https://slides.googleapis.com/v1/presentations', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: (fc.args as any).title || 'Untitled Presentation' })
                 });
                 const data = await res.json();
                 responsePayload = res.ok ? { success: true, presentationId: data.presentationId, url: `https://docs.google.com/presentation/d/${data.presentationId}/edit` } : { error: data.error?.message || "Unknown error" };
              }
              break;

            case 'create_google_form':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                 const res = await fetch('https://forms.googleapis.com/v1/forms', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ info: { title: (fc.args as any).title || 'Untitled Form' } })
                 });
                 const data = await res.json();
                 responsePayload = res.ok ? { success: true, formId: data.formId, responderUri: data.responderUri } : { error: data.error?.message || "Unknown error" };
              }
              break;

            case 'open_drive_picker':
              ui.setActiveOverlay('picker');
              responsePayload = { success: true, status: "Picker opened for user." };
              break;

            case 'schedule_meeting':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                   method: 'POST',
                   headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                   body: JSON.stringify({
                     summary: (fc.args as any).summary,
                     start: { dateTime: (fc.args as any).startDateTime },
                     end: { dateTime: (fc.args as any).endDateTime }
                   })
                });
                const data = await res.json();
                responsePayload = res.ok ? { success: true, eventLink: data.htmlLink || data.id } : { error: data.error?.message || "Unknown API error" };
              }
              break;

            case 'send_email':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                const rawMessage = [
                  `To: ${(fc.args as any).to}`,
                  `Subject: ${(fc.args as any).subject}`,
                  '',
                  (fc.args as any).body
                ].join('\n');
                const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
                  .replace(/\+/g, '-')
                  .replace(/\//g, '_')
                  .replace(/=+$/, '');
                
                const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                   method: 'POST',
                   headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                   body: JSON.stringify({ raw: encodedMessage })
                });
                const data = await res.json();
                responsePayload = res.ok ? { success: true, messageId: data.id } : { error: data.error?.message || "Unknown API error" };
              }
              break;

            case 'get_contacts':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                const res = await fetch(`https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=${(fc.args as any).maxResults || 50}`, {
                   headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                responsePayload = res.ok ? data : { error: data.error?.message || "Unknown API error" };
              }
              break;

            case 'fetch_google_api':
              if (!token) {
                responsePayload = { error: 'No Google access token found, please authenticate.' };
              } else {
                const { url, method, body } = fc.args as any;
                const headers: any = { Authorization: `Bearer ${token}` };
                if (body) {
                  headers['Content-Type'] = 'application/json';
                }
                const res = await fetch(url, {
                  method: method || 'GET',
                  headers,
                  body: body ? JSON.stringify(body) : undefined
                });
                const data = await res.json();
                responsePayload = res.ok ? { data } : { error: data.error?.message || 'API error', details: data };
                if (res.ok && data) ui.setActiveWorkspaceResult(data);
              }
              break;

            case 'send_whatsapp_message':
              try {
                const res = await api.sendWhatsappMessage((fc.args as any).number, (fc.args as any).message);
                responsePayload = { success: true, api_response: res };
              } catch (err: any) {
                responsePayload = { error: err.message };
              }
              break;

            case 'display_map':
              ui.setMapUrl((fc.args as any).iframeSrc);
              ui.setActiveOverlay('map');
              responsePayload = { status: 'Map displayed to the user.' };
              break;

            case 'search_gmail':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                const q = encodeURIComponent((fc.args as any).query);
                const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${(fc.args as any).maxResults || 20}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                responsePayload = res.ok ? data : { error: data.error?.message || 'API error' };
              }
              break;

            case 'list_google_chat_spaces':
              if (!token) {
                responsePayload = { error: 'Google OAuth token missing.' };
              } else {
                const res = await fetch('https://chat.googleapis.com/v1/spaces', {
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                const data = await res.json();
                responsePayload = res.ok ? data : { error: data.error?.message || 'API error' };
              }
              break;

            case 'send_google_chat_message':
              ui.setPendingChat({ 
                spaceName: (fc.args as any).spaceName, 
                message: (fc.args as any).messageText, 
                id: fc.id 
              });
              responsePayload = { status: 'Awaiting user confirmation in UI.' };
              break;

            case 'save_knowledge_keep':
              if (token) {
                const res = await fetch('https://keep.googleapis.com/v1/notes', {
                  method: 'POST',
                  headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    title: 'Beatrice Stored Knowledge',
                    body: { text: { text: (fc.args as any).text } }
                  })
                });
                responsePayload = await res.json();
              } else {
                responsePayload = { error: 'Unauthorized: Knowledge storage requires login.' };
              }
              break;

            case 'register_google_site_asset':
            case 'create_site_content_plan':
            case 'create_deployment_portal_copy':
            case 'create_restaurant_demo_site_copy':
              // Store the request in the workspace state for UI display
              ui.setActiveWorkspaceResult({ 
                type: 'site_asset',
                tool: fc.name,
                args: fc.args,
                timestamp: new Date().toISOString()
              });
              responsePayload = { success: true, message: `Tool ${fc.name} executed. Content plan and copy generated in the Workspace.` };
              break;

            default:
              responsePayload = { error: `Tool ${fc.name} implementation pending integration.` };
              break;
          }
        } catch (err: any) {
          console.error(`Tool execution error [${fc.name}]:`, err);
          responsePayload = { error: err.message };
        }

        return {
          id: fc.id,
          name: fc.name,
          response: responsePayload,
        };
      }));

      // Log the function call responses
      if (functionResponses.length > 0) {
        const responseMessage = `Function call response:\n\`\`\`json\n${JSON.stringify(functionResponses, null, 2)}\n\`\`\``;
        useLogStore.getState().addTurn({
          role: 'system',
          text: responseMessage,
          isFinal: true,
        });
      }

      client.sendToolResponse({ functionResponses });
    };

    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('interrupted', stopAudioStreamer);
    client.on('audio', onAudio);
    client.on('toolcall', onToolCall);

    return () => {
      // Clean up event listeners
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
      client.off('toolcall', onToolCall);
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
    client.disconnect();
    await client.connect(config);
  }, [client, config]);

  const disconnect = useCallback(async () => {
    console.trace('DISCONNECT CALLED');
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  return {
    client,
    config,
    setConfig,
    connect,
    connected,
    disconnect,
    volume,
  };
}