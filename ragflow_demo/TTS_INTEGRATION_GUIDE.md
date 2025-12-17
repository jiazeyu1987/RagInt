# RAGFlow TTS Integration Guide

## Overview

This document describes the TTS-ready text optimization system that has been implemented for RAGFlow streaming chat. The system cleans and formats streaming responses to make them suitable for future Text-to-Speech (TTS) integration while maintaining all existing functionality.

## Features Implemented

### 1. Text Cleaning Engine (`text_cleaner.py`)
- **Real-time streaming text cleaning** optimized for TTS
- **Multiple cleaning levels**: Basic, Standard, Aggressive
- **Chinese text optimization** with punctuation normalization
- **Markdown format removal** while preserving readability
- **Special character handling** for speech synthesis

### 2. TTS Buffer Management (`tts_buffer.py`)
- **Semantic chunk detection** for natural speech pauses
- **Size-based chunking** to prevent overly long segments
- **Sentence boundary identification** using Chinese punctuation
- **Real-time accumulation** of TTS-ready text chunks

### 3. Enhanced Chat Integration (`chat_agent_chat.py`)
- **Configurable text cleaning** via JSON configuration
- **Backward compatibility** - existing functionality unchanged
- **TTS data extraction** for future integration
- **Error handling** with graceful degradation

### 4. Configuration System (`ragflow_config.json`)
```json
{
  "text_cleaning": {
    "enabled": true,
    "show_cleaned_output": false,
    "language": "zh-CN",
    "cleaning_level": "standard",
    "tts_buffer_enabled": true,
    "semantic_chunking": true,
    "max_chunk_size": 200
  }
}
```

## Usage

### Basic Usage (Text Cleaning Enabled)

1. **Enable text cleaning** in `ragflow_config.json`:
   ```json
   {
     "text_cleaning": {
       "enabled": true
     }
   }
   ```

2. **Run the chat tool**:
   ```bash
   python chat_agent_chat.py
   ```

3. **Text is automatically cleaned** in real-time as it streams from RAGFlow

### Accessing TTS-Ready Text

The `process_streaming_response` function now returns TTS data:

```python
tts_data = process_streaming_response(session, message, config)

if tts_data:
    # Complete cleaned text
    clean_text = tts_data['complete_clean_text']

    # TTS-ready chunks
    tts_chunks = tts_data['tts_chunks']

    # Debug information
    buffer_status = tts_data['buffer_status']
    cleaner_status = tts_data['cleaner_status']
```

## Text Cleaning Examples

### Before Cleaning (RAGFlow Output):
```
智能体是指能够**感知环境**并利用工具采取行动以实现特定目标的代理。
智能体以大模型为智能底座，具备以下能力和特征：

1. **核心能力**：
   - **自主感知**：通过传感器等设备感知周围环境。
   - **理解**：理解和处理来自环境的信息。
```

### After Cleaning (TTS-Ready):
```
智能体是指能够感知环境并利用工具采取行动以实现特定目标的代理。
智能体以大模型为智能底座,具备以下能力和特征:

核心能力:
自主感知:通过传感器等设备感知周围环境。
理解:理解和处理来自环境的信息。
```

## Configuration Options

### Cleaning Levels
- **Basic**: Removes basic markdown formatting
- **Standard**: Comprehensive cleaning with Chinese optimization
- **Aggressive**: Removes all problematic formatting for TTS

### Key Settings
- **enabled**: Enable/disable text cleaning
- **show_cleaned_output**: Show cleaned text instead of original
- **language**: Target language (zh-CN for Chinese)
- **max_chunk_size**: Maximum TTS chunk size in characters

## Testing

### Run Basic Tests
```bash
python simple_text_test.py
```

### Run Comprehensive Tests
```bash
python text_cleaning_test.py
```

### Test Individual Components
```bash
python text_cleaner.py  # Test text cleaner
python tts_buffer.py    # Test TTS buffer
```

## TTS Integration Points

The system provides several integration points for future TTS implementation:

### 1. Real-time TTS Processing
```python
# In process_streaming_response function
if tts_buffer:
    tts_ready_chunks = tts_buffer.add_cleaned_chunk(cleaned_chunk)

    # Send to TTS engine
    for chunk in tts_ready_chunks:
        await tts_engine.speak(chunk)
```

### 2. Complete Response TTS
```python
# After response completion
if tts_data:
    complete_text = tts_data['complete_clean_text']
    await tts_engine.speak(complete_text)
```

### 3. Semantic Chunk TTS
```python
# Use semantic chunks for natural speech
for chunk in tts_data['tts_chunks']:
    await tts_engine.speak(chunk)
    # Add natural pause
    time.sleep(0.5)
```

## Performance Considerations

### Memory Usage
- **Streaming processing** minimizes memory usage
- **Configurable chunk size** controls memory allocation
- **Efficient regex patterns** pre-compiled for performance

### Latency
- **Real-time processing** with minimal overhead
- **Configurable cleaning levels** balance speed vs thoroughness
- **Background processing** options for async TTS

### CPU Usage
- **Optimized string operations** for streaming
- **Pre-compiled patterns** reduce processing time
- **Optional features** can be disabled for performance

## Troubleshooting

### Common Issues

1. **Unicode Encoding Errors**
   - Solution: Use Windows-compatible console settings
   - Alternative: Run in PowerShell with UTF-8 support

2. **Import Errors**
   - Solution: Ensure text_cleaner.py and tts_buffer.py are in the same directory
   - Check Python path configuration

3. **Configuration Issues**
   - Solution: Validate JSON syntax in ragflow_config.json
   - Ensure required fields are present

4. **Performance Issues**
   - Solution: Adjust cleaning_level to 'basic' for better performance
   - Increase max_chunk_size to reduce processing frequency

### Debug Information

Enable debug mode by setting in configuration:
```json
{
  "text_cleaning": {
    "debug_mode": true,
    "show_cleaned_output": true
  }
}
```

## Future Enhancements

### Planned Features
1. **Advanced Semantic Analysis**: Use NLP for better sentence segmentation
2. **Multiple Language Support**: Extend beyond Chinese optimization
3. **Custom Cleaning Rules**: User-defined text cleaning patterns
4. **TTS Engine Integration**: Direct integration with popular TTS services

### Integration Examples
- **Azure Speech Services**: Use `azure.cognitiveservices.speech` SDK
- **Edge TTS**: Use `edge-tts` library for Microsoft voices
- **Google TTS**: Use `google.cloud.texttospeech` API

## Compatibility

### Backward Compatibility
- ✅ **100% backward compatible** with existing chat functionality
- ✅ **Configuration disabled by default** - no impact on existing users
- ✅ **Graceful degradation** if text cleaning modules are missing

### System Requirements
- **Python 3.7+**: Required for regex features
- **Standard libraries only**: No external dependencies for core functionality
- **Optional TTS libraries**: For future TTS integration

## Support

For issues or questions:
1. Check the test suite: `python simple_text_test.py`
2. Review configuration: `ragflow_config.json`
3. Verify module imports and file locations
4. Test with different cleaning levels

---

*This implementation prepares RAGFlow streaming chat for seamless TTS integration while maintaining all existing functionality and performance characteristics.*